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
/* globals CustomStyle, scrollIntoView, PDFJS */

'use strict';

var FIND_SCROLL_OFFSET_TOP = -50;
var FIND_SCROLL_OFFSET_LEFT = -400;
var MAX_TEXT_DIVS_TO_RENDER = 100000;
var RENDER_DELAY = 200; // ms

var NonWhitespaceRegexp = /\S/;

function isAllWhitespace(str) {
  return !NonWhitespaceRegexp.test(str);
}

/**
 * @typedef {Object} TextLayerBuilderOptions
 * @property {HTMLDivElement} textLayerDiv - The text layer container.
 * @property {number} pageIndex - The page index.
 * @property {PageViewport} viewport - The viewport of the text layer.
 * @property {ILastScrollSource} lastScrollSource - The object that records when
 *   last time scroll happened.
 * @property {boolean} isViewerInPresentationMode
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
    this.layoutDone = false;
    this.divContentDone = false;
    this.pageIdx = options.pageIndex;
    this.matches = [];
    this.lastScrollSource = options.lastScrollSource || null;
    this.viewport = options.viewport;
    this.isViewerInPresentationMode = options.isViewerInPresentationMode;
    this.textDivs = [];
    this.findController = options.findController || null;
  }

  TextLayerBuilder.prototype = {
    renderLayer: function TextLayerBuilder_renderLayer() {
      var textLayerFrag = document.createDocumentFragment();
      var textDivs = this.textDivs;
      var textDivsLength = textDivs.length;
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');

      // No point in rendering many divs as it would make the browser
      // unusable even after the divs are rendered.
      if (textDivsLength > MAX_TEXT_DIVS_TO_RENDER) {
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
      this.renderingDone = true;
      this.updateMatches();
    },

    setupRenderLayoutTimer:
        function TextLayerBuilder_setupRenderLayoutTimer() {
      // Schedule renderLayout() if the user has been scrolling,
      // otherwise run it right away.
      var self = this;
      var lastScroll = (this.lastScrollSource === null ?
                        0 : this.lastScrollSource.lastScroll);

      if (Date.now() - lastScroll > RENDER_DELAY) { // Render right away
        this.renderLayer();
      } else { // Schedule
        if (this.renderTimer) {
          clearTimeout(this.renderTimer);
        }
        this.renderTimer = setTimeout(function() {
          self.setupRenderLayoutTimer();
        }, RENDER_DELAY);
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
      var debug = false;
      this.textContent = textContent;

      var textItems = textContent.items;
      var textDivs = [];
      var len = textItems.length;
      for (var it = 0; it < len; it++) {
        textDivs.push(this.appendText(textItems[it], textContent.styles));
      }
      var N = Number;
      
      
      function overlapBy(min1, min2, max1, max2, by) {
        var d = Math.min(max1,max2) - Math.max(N(min1),N(min2));
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
      function could_be_column(d, right, bottom) {
        if(right.d < 1.25*N(d.dataset.width)/d.innerHTML.length) {
            // If the space to the right less than a char length, not a column.
            return false;
        }
        if(N(d.dataset.width) > page_width/2) {
            // Can't be true if we're so wide.
            return false;
        }
        var divr = textDivs[right.j];
        if(right.d < 1.25*N(divr.dataset.width)/divr.innerHTML.length) {
            // If the space to the right less than a char length, not a column.
            return false;
        }
        if(N(divr.dataset.width) > page_width/2) {
            // Can't be true if the right is so wide.
            return false;
        }
        // If the horizontal space between d and divr is much smaller than the
        // vertical space between the next legitimate line.
        if(bottom.j !== null && right.d < bottom.d &&
                        bottom.d < N(d.dataset.height)) {
            return false;
        }
        // Whitespace should not connect columns and won't matter if it does.
        if(d.dataset.isWhitespace || divr.dataset.isWhitespace) {
            return false;
        }
        
        // We cannot rule out that this is a text column, return true.
        return true;
      }
      function could_be_next_line(d, bottom) {
        // Return true if bottom could be a line directly underneath d.
        if(bottom.j === null) {
            return false;
        }
        // They have to be vertically close
        if(bottom.d > N(d.dataset.height)) {
            return false;
        }
        // They must horizontally encapsulate each other.
        var divb = textDivs[bottom.j];
        if(!overlapBy(d.dataset.left, divb.dataset.left,
                        N(d.dataset.left) + N(d.dataset.width),
                        N(divb.dataset.left) + N(divb.dataset.width), 0.99)) {
            return false;
        }
        return true;
      }
      
      // The first item has a big impact on the flow, so track it.
      var top_left = { j : null, d : 1e6 };
      // Set each element's padding to run to the nearest right and bottom 
      // element. The padding ensures that text selection works.
      for (var i = 0; i < len; i++) {
        // TODO: This is an O(N^2) algorithm. There are others out there.
        // See generally http://en.wikipedia.org/wiki/Nearest_neighbor_search
        var divi = textDivs[i];
        var divi_left = N(divi.dataset.left);
        var divi_top = N(divi.dataset.top);
        var divi_right = divi_left + N(divi.dataset.width);
        var divi_bottom = divi_top + N(divi.dataset.height);
        
        // Keep track of the top-left most item.
        var tl_d = Math.pow(divi_left, 2) + Math.pow(divi_top, 2);
        if(top_left.j === null || tl_d < top_left.d) {
            top_left.j = i;
            top_left.d = tl_d;
        }
        
        // Keep track of the closest right and bottom elements
        var right = { j : null, d : 1e6 };
        var bottom = { j : null, d : 1e6 };
        var bottom_nolap = { j : null, d : 1e6 };
        // Allow elements overlap by a half pixel w/o being behind the object.
        var e = 1.5*this.viewport.scale;
        if(debug) {
            console.log(divi.innerHTML);
        }
        for (var j = 0; j < len; j++) {
            if(i === j) {
                continue;
            }
            var divj = textDivs[j];
            var divj_left = N(divj.dataset.left);
            var divj_top = N(divj.dataset.top);
            
            // Consider divj if it's on the same line.
            // First make sure it's ahead.
            if(divi_right <= e + divj_left && (
                // Vertical intersection
                overlapBy(divi_top, divj_top, divi_bottom,
                          divj_top + N(divj.dataset.height), 0.6)
            )) {
                var dright = divj_left - divi_right;
                if(debug) {
                    console.log('   H: ' + divj.innerHTML + ' --> ' + dright);
                }
                // Now update the max
                if(dright < right.d) {
                    right.d = dright;
                    right.j = j;
                }
            }
            
            // Consider divj if its below divi.
            if(divi_bottom <= e + divj_top) {
                // Get the distance below.
                var dbottom = divj_top - divi_bottom;
                // Horizontal intersection
                if(overlapBy(divi_left, divj_left, divi_right,
                        divj_left + N(divj.dataset.width), 0)) {
                    // Distance from bottom to top
                    if(debug) {
                        console.log('   V: ' + divj.innerHTML + ' --> ' +
                                                                    dbottom);
                    }
                    if(dbottom < bottom.d) {
                        bottom.d = dbottom;
                        bottom.j = j;
                    }
                }
                // Track of the closest below even if it doesn't overlap.
                if(dbottom < bottom_nolap.d) {
                    bottom_nolap.d = dbottom;
                    bottom_nolap.j = j;
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
        // Save this for later.
        divi.dataset.i = i;
        
        // Put the divs into a linked list based on their order.
        if(divi.dataset.vertical) {
            // Is there such thing as rows of vertical text? FixMe if so.
            if(bottom.j) {
                divi.dataset.next = bottom.j;
            }
        } else if(right.j) {
            // Check for columns.
            if(!could_be_column(divi, right, bottom)) {
                divi.dataset.next = right.j;
            } else if(could_be_next_line(divi, bottom)) {
                // Save this bottom for another pass.
                divi.dataset.saved_bottom = bottom.j;
            } else {
                // Not sure of a safe way to find the next line.
            }
        } else if(could_be_next_line(divi, bottom)) {
            divi.dataset.saved_bottom = bottom.j;
        } else if(could_be_next_line(divi, bottom_nolap)) {
            // I am not sure this is safe
            divi.dataset.saved_bottom = bottom_nolap.j;
        }
        // Make the reverse linked list.
        if(divi.dataset.next) {
            textDivs[N(divi.dataset.next)].dataset.prev = i;
        }
      }
      
      // Do another pass through the elements. This isn't O(N^2) thankfully.
      for (var i2 = 0; i2 < len; i2++) {
        var divi2 = textDivs[i2];
        if(divi2.dataset.next) {
            continue;
        }
        if(!divi2.dataset.saved_bottom) {
            continue;
        }
        var bottom_j = N(divi2.dataset.saved_bottom);
        var divb2 = textDivs[bottom_j];
        // We no longer need to hold on to this
        delete divi2.dataset.saved_bottom;
        // Get the first element in the following line.
        var firstb = divb2;
        while(firstb.dataset.prev) {
            // Move backwards
            var prevB = textDivs[N(firstb.dataset.prev)];
            // Make sure they overlap vertically
            if(!overlapBy(divb2.dataset.top, prevB.dataset.top,
                    N(divb2.dataset.top) + N(divb2.dataset.height),
                    N(prevB.dataset.top) + N(prevB.dataset.height), 0.8)) {
                // No overlap
                break;
            }
            firstb = prevB;
        }
        // If it's already linked up, then don't overwrite.
        if(!firstb.dataset.prev) {
            divi2.dataset.next = firstb.dataset.i;
            firstb.dataset.prev = i2;
        }
      }
      
      // Final pass, we 
      var added = {};
      var orderedDivs = this.textDivs;
      function add_item_list(a) {
        if(added[a]) {
            return false;
        }
        var divadd = textDivs[a];
        if(divadd.dataset.prev) {
            // Do not process this text element yet, it is linked to by 
            // another text element.
            delete divadd.dataset.prev;
            return;
        }
        
        orderedDivs.push(divadd);
        added[a] = true;
        while(typeof(divadd.dataset.next) !== 'undefined') {
            var next = N(divadd.dataset.next);
            delete divadd.dataset.next;
            if(added[next]) {
                break;
            }
            divadd = textDivs[next];
            orderedDivs.push(divadd);
            added[next] = true;
        }
      }
      if(top_left.j) {
        add_item_list(top_left.j);
      }
      for (var a = 0; a < len; a++) {
        add_item_list(a);
      }
      
      this.divContentDone = true;
      this.setupRenderLayoutTimer();
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
      var isSelectedPage = (this.findController === null ?
        false : (this.pageIdx === this.findController.selected.pageIdx));
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

        if (isSelected && !this.isViewerInPresentationMode) {
          scrollIntoView(textDivs[begin.divIdx],
                         { top: FIND_SCROLL_OFFSET_TOP,
                           left: FIND_SCROLL_OFFSET_LEFT });
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
