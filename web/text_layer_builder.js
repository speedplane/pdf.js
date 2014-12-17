/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* globals CustomStyle, PDFJS */

'use strict';

var MAX_TEXT_DIVS_TO_RENDER = 100000;

var NonWhitespaceRegexp = /\S/;

function isAllWhitespace(str) {
  return !NonWhitespaceRegexp.test(str);
}

/**
 * @typedef {Object} TextLayerBuilderOptions
 * @property {HTMLDivElement} textLayerDiv - The text layer container.
 * @property {number} pageIndex - The page index.
 * @property {PageViewport} viewport - The viewport of the text layer.
 * @property {PDFFindController} findController
 */

/**
 * TextLayerBuilder provides text-selection functionality for the PDF.
 * It does this by creating overlay divs over the PDF text. These divs
 * contain text that matches the PDF text they are overlaying. This object
 * also provides a way to highlight text that is being searched for.
 * @class
 */
var TextLayerBuilder = (function TextLayerBuilderClosure() {
  function TextLayerBuilder(options) {
    this.textLayerDiv = options.textLayerDiv;
    this.renderingDone = false;
    this.divContentDone = false;
    this.pageIdx = options.pageIndex;
    this.pageNumber = this.pageIdx + 1;
    this.matches = [];
    this.viewport = options.viewport;
    this.textDivs = [];
    this.findController = options.findController || null;
  }

  TextLayerBuilder.prototype = {
    _finishRendering: function TextLayerBuilder_finishRendering() {
      this.renderingDone = true;

      var event = document.createEvent('CustomEvent');
      event.initCustomEvent('textlayerrendered', true, true, {
        pageNumber: this.pageNumber
      });
      this.textLayerDiv.dispatchEvent(event);
    },

    renderLayer: function TextLayerBuilder_renderLayer() {
      var textLayerFrag = document.createDocumentFragment();
      var textDivs = this.textDivs;
      var textDivsLength = textDivs.length;
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');

      // No point in rendering many divs as it would make the browser
      // unusable even after the divs are rendered.
      if (textDivsLength > MAX_TEXT_DIVS_TO_RENDER) {
        this._finishRendering();
        return;
      }

      var lastFontSize;
      var lastFontFamily;
      for (var i = 0; i < textDivsLength; i++) {
        var textDiv = textDivs[i];

        var fontSize = textDiv.style.fontSize;
        var fontFamily = textDiv.style.fontFamily;

        // Only build font string and set to context if different from last.
        if (fontSize !== lastFontSize || fontFamily !== lastFontFamily) {
          ctx.font = fontSize + ' ' + fontFamily;
          lastFontSize = fontSize;
          lastFontFamily = fontFamily;
        }

        var width = ctx.measureText(textDiv.textContent).width;
        if (width > 0) {
          textLayerFrag.appendChild(textDiv);
          var transform;
          if (textDiv.dataset.canvasWidth !== undefined) {
            // Dataset values come of type string.
            var textScale = textDiv.dataset.canvasWidth / width;
            transform = 'scaleX(' + textScale + ')';
          } else {
            transform = '';
          }
          var rotation = textDiv.dataset.angle;
          if (rotation) {
            transform = 'rotate(' + rotation + 'deg) ' + transform;
          }
          if (transform) {
            CustomStyle.setProp('transform' , textDiv, transform);
          }
        }
      }

      this.textLayerDiv.appendChild(textLayerFrag);
      this._finishRendering();
      this.updateMatches();
    },

    /**
     * Renders the text layer.
     * @param {number} timeout (optional) if specified, the rendering waits
     *   for specified amount of ms.
     */
    render: function TextLayerBuilder_render(timeout) {
      if (!this.divContentDone || this.renderingDone) {
        return;
      }

      if (this.renderTimer) {
        clearTimeout(this.renderTimer);
        this.renderTimer = null;
      }

      if (!timeout) { // Render right away
        this.renderLayer();
      } else { // Schedule
        var self = this;
        this.renderTimer = setTimeout(function() {
          self.renderLayer();
          self.renderTimer = null;
        }, timeout);
      }
    },

    appendText: function TextLayerBuilder_appendText(geom, styles) {
      var style = styles[geom.fontName];
      var textDiv = document.createElement('div');
      if (isAllWhitespace(geom.str)) {
        // Whitespace elements aren't visible, but they're used for copy/paste.
        textDiv.dataset.isWhitespace = true;
        textDiv.className += ' whitespace';
      }
      var tx = PDFJS.Util.transform(this.viewport.transform, geom.transform);
      var angle = Math.atan2(tx[1], tx[0]);
      if (style.vertical) {
        angle += Math.PI / 2;
      }
      var fontHeight = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3]));
      var fontAscent = fontHeight;
      if (style.ascent) {
        fontAscent = style.ascent * fontAscent;
      } else if (style.descent) {
        fontAscent = (1 + style.descent) * fontAscent;
      }

      var left;
      var top;
      if (angle === 0) {
        left = tx[4];
        top = tx[5] - fontAscent;
      } else {
        left = tx[4] + (fontAscent * Math.sin(angle));
        top = tx[5] - (fontAscent * Math.cos(angle));
      }
      textDiv.style.left = left + 'px';
      textDiv.style.top = top + 'px';
      textDiv.style.fontSize = fontHeight + 'px';
      textDiv.style.fontFamily = style.fontFamily;

      textDiv.dataset.left = left;
      textDiv.dataset.top = top;
      textDiv.dataset.width = geom.width * this.viewport.scale;
      textDiv.dataset.height = geom.height * this.viewport.scale;

      textDiv.textContent = geom.str;
      // |fontName| is only used by the Font Inspector. This test will succeed
      // when e.g. the Font Inspector is off but the Stepper is on, but it's
      // not worth the effort to do a more accurate test.
      if (PDFJS.pdfBug) {
        textDiv.dataset.fontName = geom.fontName;
      }
      // Storing into dataset will convert number into string.
      if (angle !== 0) {
        textDiv.dataset.angle = angle * (180 / Math.PI);
      }
      if(style.vertical) {
        textDiv.dataset.vertical = true;
      }
      // We don't bother scaling single-char text divs, because it has very
      // little effect on text highlighting. This makes scrolling on docs with
      // lots of such divs a lot faster.
      if (textDiv.textContent.length > 1) {
        if (style.vertical) {
          textDiv.dataset.canvasWidth = geom.height * this.viewport.scale;
        } else {
          textDiv.dataset.canvasWidth = geom.width * this.viewport.scale;
        }
      }
      return textDiv;
    },

    setTextContent: function TextLayerBuilder_setTextContent(textContent) {
      var debug = false;
      this.textContent = textContent;

      var textItems = textContent.items;
      var textDivs = [];
      for (var it = 0, len = textItems.length; it < len; it++) {
        textDivs.push(this.appendText(textItems[it], textContent.styles));
      }
      var N = Number;
      
      
      function overlapBy(min1, min2, max1, max2, by) {
        var d = Math.min(max1,max2) - Math.max(N(min1),N(min2));
        return d > (max1-min1) * by || d > (max2-min2) * by;
      }
      
      // Set each element's padding to run to the nearest right and bottom 
      // element. The padding ensures that text selection works.
      for (var i = 0, leni = textDivs.length; i < leni; i++) {
        // TODO: This is an O(N^2) algorithm. There are others out there.
        // See generally http://en.wikipedia.org/wiki/Nearest_neighbor_search
        var divi = textDivs[i];
        var divi_right = N(divi.dataset.left) + N(divi.dataset.width);
        var divi_bottom = N(divi.dataset.top) + N(divi.dataset.height);
        // Keep track of the closest right and bottom elements
        var right = { j : null, d : 1e6 };
        var bottom = { j : null, d : 1e6 };
        // Allow elements overlap by a half pixel w/o being behind the object.
        var e = 0.5*this.viewport.scale;
        console.log(divi.innerHTML);
        for (var j = 0, lenj = textDivs.length; j < lenj; j++) {
            if(i === j) {
                continue;
            }
            var divj = textDivs[j];
            // Consider divj if it's on the same line. 
            // First make sure it's ahead.
            if(divi_right <= e + N(divj.dataset.left) && (
                // Vertical intersection
                overlapBy(divi.dataset.top, divj.dataset.top, divi_bottom,
                            N(divj.dataset.top) + N(divj.dataset.height), 0.5)
            )) {
                var dright = N(divj.dataset.left) - divi_right;
                if(debug) {
                    console.log('   H: ' + divj.innerHTML + ' --> ' + dright);
                }
                // Now update the max
                if(dright < right.d) {
                    right.d = dright;
                    right.j = j;
                }
            }
            
            // Consider divj if its on an intersecting column.
            if(divi_bottom <= e + Number(divj.dataset.top) && (
                // Horizontal intersection
                (N(divi.dataset.left) <= N(divj.dataset.left) &&
                    divi_right > N(divj.dataset.left)) || (
                N(divi.dataset.left) >= N(divj.dataset.left) &&
                    N(divi.dataset.left) < N(divj.dataset.left) +
                                                        N(divj.dataset.width))
            )) {
                // Distance from bottom to top
                var dbottom = Number(divj.dataset.top) - divi_bottom;
                if(debug) {
                    console.log('   V: ' + divj.innerHTML + ' --> ' + dbottom);
                }
                if(dbottom < bottom.d) {
                    bottom.d = dbottom;
                    bottom.j = j;
                }
            }
        }
        // Update the padding
        divi.style.paddingRight = right.j !== null ?
                    (N(textDivs[right.j].dataset.left) - divi_right) + 'px':
                    // Take up the rest of the horizontal line on the page
                    (this.textLayerDiv.offsetWidth - divi_right) + 'px';
        divi.style.paddingBottom = bottom.j !== null ?
                    (N(textDivs[bottom.j].dataset.top) - divi_bottom) + 'px':
                    // Take up the rest of the vertical space on the page
                    (this.textLayerDiv.offsetHeight - divi_bottom) + 'px';
        if(debug) {
            console.log('H ' + right.j + ': ' +
                    (right.j ? textDivs[right.j].innerHTML : ''));
            console.log('V ' + bottom.j+ ': ' +
                    (bottom.j ? textDivs[bottom.j].innerHTML:''));
            console.log('');
        }
        
        // Put the divs into a linked list based on their order.
        if(divi.dataset.vertical && bottom.j) {
            // Is there such thing as rows of vertical text? FixMe if so.
            divi.dataset.next = bottom.j;
        } else if(!divi.dataset.vertical && right.j && bottom.j) {
            // Check for columns. Be conservative and don't re-order unless
            // we're sure it isn't a column.
            var divb = textDivs[bottom.j];
            var divr = textDivs[right.j];
            // Must be less than 20% page to reorder (columns usually more)
            if(N(divi.dataset.width) < this.textLayerDiv.offsetWidth/3 &&
                N(divr.dataset.width) < this.textLayerDiv.offsetWidth/3 && (
                // Either require the line to be very small
                N(divi.dataset.width) < this.textLayerDiv.offsetWidth/50 ||
                // If they are much closer laterally than vertically.
                right.d < bottom.d/2 ||
                // Or require they're not very overlapped
                !overlapBy(divi.dataset.left, divb.dataset.left, divi_right,
                    N(divb.dataset.width) + N(divb.dataset.left), 0.8))) {
                // Not a column, reorder.
                divi.dataset.next = right.j;
            }
        } else if(!divi.dataset.vertical && right.j) {
            // This could be the last line of a text column page. This is
            // harder so we're less conservative.
            var divr2 = textDivs[right.j];
            // Must be less than 20% page to reorder (columns usually more)
            if(N(divi.dataset.width) < this.textLayerDiv.offsetWidth/3 &&
                N(divr2.dataset.width) < this.textLayerDiv.offsetWidth/3) {
                // Either require the line to be very small
                divi.dataset.next = right.j;
            }
        }
        // Make the reverse linked list.
        if(divi.dataset.next) {
            textDivs[N(divi.dataset.next)].dataset.prev = i;
        }
      }
      
      // Final pass, we 
      var added = {};
      for (var a = 0, lena = textDivs.length; a < lena; a++) {
        if(added[a]) {
            continue;
        }
        var divadd = textDivs[a];
        if(divadd.dataset.prev) {
            // Do not process this text element yet, it is linked to by 
            // another text element.
            delete divadd.dataset.prev;
            continue;
        }
        
        this.textDivs.push(divadd);
        added[a] = true;
        while(divadd.dataset.next !== null) {
            var next = N(divadd.dataset.next);
            // delete divadd.dataset.next;
            if(added[next]) {
                break;
            }
            divadd = textDivs[next];
            this.textDivs.push(divadd);
            added[next] = true;
        }
      }
      
      this.divContentDone = true;
    },

    convertMatches: function TextLayerBuilder_convertMatches(matches) {
      var i = 0;
      var iIndex = 0;
      var bidiTexts = this.textContent.items;
      var end = bidiTexts.length - 1;
      var queryLen = (this.findController === null ?
                      0 : this.findController.state.query.length);
      var ret = [];

      for (var m = 0, len = matches.length; m < len; m++) {
        // Calculate the start position.
        var matchIdx = matches[m];

        // Loop over the divIdxs.
        while (i !== end && matchIdx >= (iIndex + bidiTexts[i].str.length)) {
          iIndex += bidiTexts[i].str.length;
          i++;
        }

        if (i === bidiTexts.length) {
          console.error('Could not find a matching mapping');
        }

        var match = {
          begin: {
            divIdx: i,
            offset: matchIdx - iIndex
          }
        };

        // Calculate the end position.
        matchIdx += queryLen;

        // Somewhat the same array as above, but use > instead of >= to get
        // the end position right.
        while (i !== end && matchIdx > (iIndex + bidiTexts[i].str.length)) {
          iIndex += bidiTexts[i].str.length;
          i++;
        }

        match.end = {
          divIdx: i,
          offset: matchIdx - iIndex
        };
        ret.push(match);
      }

      return ret;
    },

    renderMatches: function TextLayerBuilder_renderMatches(matches) {
      // Early exit if there is nothing to render.
      if (matches.length === 0) {
        return;
      }

      var bidiTexts = this.textContent.items;
      var textDivs = this.textDivs;
      var prevEnd = null;
      var pageIdx = this.pageIdx;
      var isSelectedPage = (this.findController === null ?
        false : (pageIdx === this.findController.selected.pageIdx));
      var selectedMatchIdx = (this.findController === null ?
                              -1 : this.findController.selected.matchIdx);
      var highlightAll = (this.findController === null ?
                          false : this.findController.state.highlightAll);
      var infinity = {
        divIdx: -1,
        offset: undefined
      };

      function beginText(begin, className) {
        var divIdx = begin.divIdx;
        textDivs[divIdx].textContent = '';
        appendTextToDiv(divIdx, 0, begin.offset, className);
      }

      function appendTextToDiv(divIdx, fromOffset, toOffset, className) {
        var div = textDivs[divIdx];
        var content = bidiTexts[divIdx].str.substring(fromOffset, toOffset);
        var node = document.createTextNode(content);
        if (className) {
          var span = document.createElement('span');
          span.className = className;
          span.appendChild(node);
          div.appendChild(span);
          return;
        }
        div.appendChild(node);
      }

      var i0 = selectedMatchIdx, i1 = i0 + 1;
      if (highlightAll) {
        i0 = 0;
        i1 = matches.length;
      } else if (!isSelectedPage) {
        // Not highlighting all and this isn't the selected page, so do nothing.
        return;
      }

      for (var i = i0; i < i1; i++) {
        var match = matches[i];
        var begin = match.begin;
        var end = match.end;
        var isSelected = (isSelectedPage && i === selectedMatchIdx);
        var highlightSuffix = (isSelected ? ' selected' : '');

        if (this.findController) {
          this.findController.updateMatchPosition(pageIdx, i, textDivs,
                                                  begin.divIdx, end.divIdx);
        }

        // Match inside new div.
        if (!prevEnd || begin.divIdx !== prevEnd.divIdx) {
          // If there was a previous div, then add the text at the end.
          if (prevEnd !== null) {
            appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
          }
          // Clear the divs and set the content until the starting point.
          beginText(begin);
        } else {
          appendTextToDiv(prevEnd.divIdx, prevEnd.offset, begin.offset);
        }

        if (begin.divIdx === end.divIdx) {
          appendTextToDiv(begin.divIdx, begin.offset, end.offset,
                          'highlight' + highlightSuffix);
        } else {
          appendTextToDiv(begin.divIdx, begin.offset, infinity.offset,
                          'highlight begin' + highlightSuffix);
          for (var n0 = begin.divIdx + 1, n1 = end.divIdx; n0 < n1; n0++) {
            textDivs[n0].className = 'highlight middle' + highlightSuffix;
          }
          beginText(end, 'highlight end' + highlightSuffix);
        }
        prevEnd = end;
      }

      if (prevEnd) {
        appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
      }
    },

    updateMatches: function TextLayerBuilder_updateMatches() {
      // Only show matches when all rendering is done.
      if (!this.renderingDone) {
        return;
      }

      // Clear all matches.
      var matches = this.matches;
      var textDivs = this.textDivs;
      var bidiTexts = this.textContent.items;
      var clearedUntilDivIdx = -1;

      // Clear all current matches.
      for (var i = 0, len = matches.length; i < len; i++) {
        var match = matches[i];
        var begin = Math.max(clearedUntilDivIdx, match.begin.divIdx);
        for (var n = begin, end = match.end.divIdx; n <= end; n++) {
          var div = textDivs[n];
          div.textContent = bidiTexts[n].str;
          div.className = '';
        }
        clearedUntilDivIdx = match.end.divIdx + 1;
      }

      if (this.findController === null || !this.findController.active) {
        return;
      }

      // Convert the matches on the page controller into the match format
      // used for the textLayer.
      this.matches = this.convertMatches(this.findController === null ?
        [] : (this.findController.pageMatches[this.pageIdx] || []));
      this.renderMatches(this.matches);
    }
  };
  return TextLayerBuilder;
})();

/**
 * @constructor
 * @implements IPDFTextLayerFactory
 */
function DefaultTextLayerFactory() {}
DefaultTextLayerFactory.prototype = {
  /**
   * @param {HTMLDivElement} textLayerDiv
   * @param {number} pageIndex
   * @param {PageViewport} viewport
   * @returns {TextLayerBuilder}
   */
  createTextLayerBuilder: function (textLayerDiv, pageIndex, viewport) {
    return new TextLayerBuilder({
      textLayerDiv: textLayerDiv,
      pageIndex: pageIndex,
      viewport: viewport
    });
  }
};
