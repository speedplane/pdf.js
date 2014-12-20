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
      if (geom.isWhitespace || isAllWhitespace(geom.str)) {
        // Whitespace elements aren't visible, but they're used for copy/paste.
        geom.isWhitespace = true;
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
      // Save info about the div in the geom for fast access.
      geom.div = {
        left    : left,
        top     : top,
        width   : geom.width * this.viewport.scale,
        height  : geom.height * this.viewport.scale,
        vertical: style.vertical ? true:false,
      };
      geom.flow = { }; // This gets added later.
      
      textDiv.style.left = left + 'px';
      textDiv.style.top = top + 'px';
      textDiv.style.fontSize = fontHeight + 'px';
      textDiv.style.fontFamily = style.fontFamily;
      
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
      // We don't bother scaling single-char text divs, because it has very
      // little effect on text highlighting. This makes scrolling on docs with
      // lots of such divs a lot faster.
      if(textDiv.textContent.length > 1) {
          textDiv.dataset.canvasWidth =  style.vertical ?
                    geom.height * this.viewport.scale:
                    geom.width * this.viewport.scale;
      }
      return textDiv;
    },

    setTextContent: function TextLayerBuilder_setTextContent(textContent) {
      // This function will add the text divs and append them to the DOM.
      // It does two things that are computationally expensive:
      //    1 - Finds the nearest neighbour of each text element, so we can add
      //        padding around the element to improve selection experience.
      //    2 - Reorders the DOM elements in the stream so they are more closely
      //        in order of appearance in the PDF (also improving select).
      var debug = true;
      this.textContent = textContent;

      var textItems = textContent.items;
      var len = textItems.length;
      
      var textDivs = []; // Just temporary
      for (var i = 0; i < len; i++) {
        textDivs.push(this.appendText(textItems[i], textContent.styles));
      }
      
      function overlapBy(min1, min2, max1, max2, by) {
        var d = Math.min(max1,max2) - Math.max(min1,min2);
        return d > (max1-min1) * by || d > (max2-min2) * by;
      }
      
      var page_width = this.textLayerDiv.offsetWidth;
      /**
       * Returns true if an element and the element directly to the right could
       * be two separate columns in a text column.
       *
       * @d     the div that we're checking.
       * @right structure telling us the div to the right.
       * @bottom structure telling us the div to the bottom.
       *
       * @return true if the right item "could be" a separate text column. We 
       *         return false if we know that it isn't.  We change the text 
       *         layout if it's not a column in order to improve selectability.
       **/
      function could_be_column(geom, geom_r, geom_b) {
        if(right.d < 1.25*geom.div.width/geom.str.length) {
            // If the space to the right less than a char length, not a column.
            return false;
        }
        if(geom.div.width > page_width/2) {
            // Can't be true if we're so wide.
            return false;
        }
        var right_d = geom_r.left - geom.div.left - geom.div.width;
        if(right_d < 1.25*geom_r.div.width/geom_r.str.length) {
            // If the space to the right less than a char length, not a column.
            return false;
        }
        if(geom_r.div.width > page_width/2) {
            // Can't be true if the right is so wide.
            return false;
        }
        if(geom_b !== null) {
          // If horizontal spacing is much smaller than next vertical spacing.
          var bottom_d = geom_b.top - geom.div.top - geom.div.height;
          if(right_d < bottom_d && bottom_d < geom.div.height) {
            return false;
          }
        }
        // Whitespace should not connect columns and won't matter if it does.
        if(geom.isWhitespace || geom_r.isWhitespace) {
            return false;
        }
        
        // We cannot rule out that this is a text column, return true.
        return true;
      }
      function could_be_next_line(geom, geom_b) {
        // Return true if bottom could be a line directly underneath d.
        if(geom_b === null) {
            return false;
        }
        // They have to be vertically close
        var bottom_d = geom_b.top - geom.div.top - geom.div.height;
        if(bottom_d > geom.div.height) {
            return false;
        }
        // They must horizontally encapsulate each other.
        var divb = textDivs[bottom.j];
        if(!overlapBy(geom.div.left, geom_b.div.left,
                        geom.div.left + geom.div.width,
                        geom_b.div.left + geom_b.div.width), 0.99) {
            return false;
        }
        return true;
      }
      
      // Set each element's padding to run to the nearest right and bottom 
      // element. The padding ensures that text selection works.
      

      // The first item has a big impact on the flow, so track it.
      var top_left = { j : null, d : 1e6 };
      for (i = 0; i < len; i++) {
        var geom = textItems[i];
        var divi = textDivs[i];
      
        // Keep track of the top-left most item.
        var tl_d = Math.pow(geom.div.left, 2) + Math.pow(geom.div.top, 2);
        if(top_left.j === null || tl_d < top_left.d) {
            top_left.j = i;
            top_left.d = tl_d;
        }
        
        var right   = geom.div.left + geom.div.width;
        var bottom  = geom.div.top + geom.div.height;
        
        var geom_r = geom.right !== undefined ? textItems[geom.right] : null;
        var geom_b = geom.below !== undefined ? textItems[geom.below] : null;
        
        // Update Padding
        divi.style.paddingRight = geom_r !== null ?
                    (geom_r.div.left - right) + 'px':
                    // Take up the rest of the horizontal line on the page
                    (this.textLayerDiv.offsetWidth - right) + 'px';
        divi.style.paddingBottom = geom_b !== null ?
                    (geom_b.top - bottom) + 'px':
                    // Take up the rest of the vertical space on the page
                    (this.textLayerDiv.offsetHeight - bottom) + 'px';
        if(debug) {
            divi.dataset.i = i;
            console.log(geom.id + ": " + geom.str);
            if(geom_r !== null) {
              console.log('  H ' + geom_r.id + ': ' + geom_r.str);
            }
            if(geom_b !== null) {
              console.log('  V ' + geom_b.id + ': ' + geom_b.str);
            }
            console.log('');
        }
        
        // Put the divs into a linked list based on their order.
        if(geom.div.vertical) {
            // Is there such thing as rows of vertical text? FixMe if so.
            if(geom_b) {
                divi.dataset.next = geom_b.id;
            }
        } else if(geom_r) {
            // Check for columns.
            if(!could_be_column(geom, geom_r, geom_b)) {
                geom.flow.next = geom_r.id;
            } else if(could_be_next_line(geom, geom_b)) {
                // Save this bottom for another pass.
                geom.flow.saved_bottom = geom_b.id;
            } else {
                // Not sure of a safe way to find the next line.
            }
        } else if(could_be_next_line(geom, geom_b)) {
            divi.dataset.saved_bottom = geom_b.id;
        }
        // Make the reverse linked list.
        if(geom.flow.next) {
            textItems[geom.flow.next].flow.prev = geom.id;
        }
      }
      
      // 
      // for (i = 0; i < len; i++) {
        // geom = textItems[i];
        // if(geom.next !== undefined || divi2.dataset.saved_bottom === undefined) {
            // continue;
        // }
        // var divi = textDivs[i];
        // var divi2 = textDivs[i2];
        // var bottom_j = N(divi2.dataset.saved_bottom);
        // var divb2 = textDivs[bottom_j];
        // // We no longer need to hold on to this
        // delete divi2.dataset.saved_bottom;
        // // Get the first element in the following line.
        // var firstb = divb2;
        // while(firstb.dataset.prev) {
            // // Move backwards
            // var prevB = textDivs[N(firstb.dataset.prev)];
            // // Make sure they overlap vertically
            // if(!overlapBy(divb2.dataset.top, prevB.dataset.top,
                    // N(divb2.dataset.top) + N(divb2.dataset.height),
                    // N(prevB.dataset.top) + N(prevB.dataset.height), 0.8)) {
                // // No overlap
                // break;
            // }
            // firstb = prevB;
        // }
        // // If it's already linked up, then don't overwrite.
        // if(!firstb.dataset.prev) {
            // divi2.dataset.next = firstb.dataset.i;
            // firstb.dataset.prev = i2;
        // }
      // }
      
      // Final pass: Re-order the divs for the proper text flow.
      var added = {};
      var orderedDivs = this.textDivs;
      function add_item_list(a) {
        if(added[a]) {
            return;
        }
        var g = textItems[a];
        if(g.flow.prev) {
            // Do not process this text element yet, it is linked to by 
            // another text element.
            return;
        }
        orderedDivs.push(textDivs[a]);
        added[a] = true;
        while(g.flow.next !== undefined) {
            if(added[g.flow.next]) {
                break;
            }
            orderedDivs.push(textDivs[g.flow.next]);
            added[g.flow.next] = true;
            g = textItems[g.flow.next];
        }
      }
      if(top_left.j) {
        add_item_list(top_left.j);
      }
      for (var a = 0; a < len; a++) {
        add_item_list(a);
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
