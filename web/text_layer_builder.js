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
      var textItems = this.textContent.items;
      var textDivsLength = textDivs.length;

      // No point in rendering many divs as it would make the browser
      // unusable even after the divs are rendered.
      if (textDivsLength > MAX_TEXT_DIVS_TO_RENDER) {
        return;
      }

      for (var i = 0; i < textDivsLength; i++) {
        if (textItems[i].width > 0) {
          textLayerFrag.appendChild(textDivs[i]);
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

    appendText: function TextLayerBuilder_appendText(geom, styles, ctx) {
      var style = styles[geom.fontName];
      var textDiv = document.createElement('div');
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
      
      // Only build font string and set to context if different from last.
      if (fontHeight !== ctx.lastFontHeight ||
          style.fontFamily !== ctx.lastFontFamily) {
        ctx.ctx.font = fontHeight + 'px ' + style.fontFamily;
        ctx.lastFontHeight = fontHeight;
        ctx.lastFontFamily = style.fontFamily;
      }
      
      // Save info about the div in the geom for fast access.
      geom.divLeft = left;
      geom.divTop = top;
      if (angle) {
        geom.divAngle = angle;
      }
      geom.vertical = style.vertical ? true : false;
      geom.textScale = (geom.vertical ? geom.height : geom.width ) /
        (ctx.ctx.measureText(geom.str).width / this.viewport.scale);
            
      textDiv.style.left = left + 'px';
      textDiv.style.top = top + 'px';
      textDiv.style.fontSize = fontHeight + 'px';
      textDiv.style.fontFamily = style.fontFamily;
      textDiv.textContent = geom.str;
      
      // Always set scaleX. Chrome has selection padding artifacts if not.
      var transform = 'scaleX(' + geom.textScale + ')';
      if (angle) {
        transform = 'rotate(' + (angle * (180 / Math.PI)) + 'deg) ' +
                    transform;
      }
      CustomStyle.setProp('transform' , textDiv, transform);
          
      // |fontName| is only used by the Font Inspector. This test will succeed
      // when e.g. the Font Inspector is off but the Stepper is on, but it's
      // not worth the effort to do a more accurate test.
      if (PDFJS.pdfBug) {
        textDiv.dataset.fontName = geom.fontName;
      }
        
      return textDiv;
    },

    setTextContent: function TextLayerBuilder_setTextContent(textContent) {
      // This function will add the text divs and append them to the DOM
      this.textContent = textContent;
      var textItems = textContent.items;
      var len = textItems.length;
      // Construct an object to keep track of current fonts.
      var canvas = document.createElement('canvas');
      var ctx = {
        ctx: canvas.getContext('2d'),
        lastFontHeight: null,
        lastFontFamily: null,
      };
      // Set in viewer.css.
      var LINE_HEIGHT = 1.14;
      var textDivs = []; // Just temporary
      for (var i = 0; i < len; i++) {
        textDivs.push(this.appendText(textItems[i], textContent.styles, ctx));
      }
      // Set each element's padding to run to the nearest right and bottom 
      // element. The padding ensures that text selection works.
      var pageW = this.textLayerDiv.offsetWidth;
      var pageH = this.textLayerDiv.offsetHeight;
      var scale = this.viewport.scale;
      for (i = 0; i < len; i++) {
        var geom = textItems[i];
        var divi = textDivs[i];
        
        if (geom.divAngle) {
          // Angled text is more complex and outside the scope... for now.
          continue;
        }
        
        var bottom = geom.divTop + geom.height * scale * LINE_HEIGHT;
        var right = geom.divLeft + geom.width * scale;
        
        var farRight = geom.right !== null ?
                        textItems[geom.right].divLeft : pageW;
        var farBottom = geom.bottom !== null ?
                         textItems[geom.bottom].divTop : pageH;
        
        // Update Padding. Apply textScale as appropriate (horizontal only).
        divi.style.paddingRight = (farRight - right) / geom.textScale + 'px';
        divi.style.paddingBottom = (farBottom - bottom) + 'px';
        // If there is nothing to the left, then pad to the left
        if (geom.left === undefined) {
          // Fix left padding, taking into account the text scaling.
          divi.style.paddingLeft = geom.divLeft / geom.textScale + 'px';
          divi.style.left = '0px';
        } else {
          var leftItem = textItems[geom.left];
          if (leftItem.right !== i && leftItem.divTop <= geom.divTop &&
              leftItem.divTop + leftItem.height * scale * LINE_HEIGHT 
              >= bottom) {
            // The object to the left is too tall to extend its right padding to 
            // this object. So this object should extend its left padding to it.
            var farLeft = leftItem.divLeft + leftItem.width;
            divi.style.left = farLeft + 'px';
            divi.style.paddingLeft = (geom.divLeft - farLeft) /
              geom.textScale + 'px';
          }
        }
        // If there is nothing above us, then pad to the top
        if (geom.top === undefined) {
          divi.style.paddingTop = geom.divTop + 'px';
          divi.style.top = '0px';
        }
      }
      this.textDivs = textDivs;
      
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
