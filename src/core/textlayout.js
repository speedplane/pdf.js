/* -*- tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
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
/* globals assert, ColorSpace, DecodeStream, Dict, Encodings,
           error, ErrorFont, Font, FONT_IDENTITY_MATRIX, fontCharsToUnicode,
           FontFlags, ImageKind, info, isArray, isCmd, isDict, isEOF, isName,
           isNum, isStream, isString, JpegStream, Lexer, Metrics,
           Name, Parser, Pattern, PDFJS, warn, Util, Promise,
           createPromiseCapability, QuadTree */
 
'use strict';
 
var TextLayoutEvaluator = (function TextLayoutEvaluatorClosure() {
  function TextLayoutEvaluator() {
  }
 
  var NonWhitespaceRegexp = /\S/;
  function isAllWhitespace(str) {
    return !NonWhitespaceRegexp.test(str);
  }

  // Trying to minimize Date.now() usage and check every 100 time 
  var TIME_SLOT_DURATION_MS = 20;
  var CHECK_TIME_EVERY = 100;
  function TimeSlotManager() {
    this.reset();
  }
  TimeSlotManager.prototype = {
    check: function TimeSlotManager_check() {
      if (++this.checked < CHECK_TIME_EVERY) {
        return false;
      }
      this.checked = 0;
      return this.endTime <= Date.now();
    },
    reset: function TimeSlotManager_reset() {
      this.endTime = Date.now() + TIME_SLOT_DURATION_MS;
      this.checked = 0;
    }
  };
  var deferred = Promise.resolve();

  TextLayoutEvaluator.prototype = {
    overlapBy : function (min1, min2, max1, max2, by) {
        var d = Math.min(max1,max2) - Math.max(min1,min2);
        return d > (max1-min1) * by || d > (max2-min2) * by;
    },
    
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
    could_be_column : function (d, right, bottom) {
      if(right.d < 1.25*d.width/d.innerHTML.length) {
          // If the space to the right less than a char length, not a column.
          return false;
      }
      if(d.width > page_width/2) {
          // Can't be true if we're so wide.
          return false;
      }
      var divr = textDivs[right.j];
      if(right.d < 1.25*divr.width/divr.innerHTML.length) {
          // If the space to the right less than a char length, not a column.
          return false;
      }
      if(divr.width > page_width/2) {
          // Can't be true if the right is so wide.
          return false;
      }
      // If the horizontal space between d and divr is much smaller than the
      // vertical space between the next legitimate line.
      if(bottom.j !== null && right.d < bottom.d &&
                      bottom.d < d.height) {
          return false;
      }
      // Whitespace should not connect columns and won't matter if it does.
      if(d.isWhitespace || divr.isWhitespace) {
          return false;
      }
      
      // We cannot rule out that this is a text column, return true.
      return true;
    },
    
    could_be_next_line : function (d, bottom) {
      // Return true if bottom could be a line directly underneath d.
      if(bottom.j === null) {
          return false;
      }
      // They have to be vertically close
      if(bottom.d > d.height) {
          return false;
      }
      // They must horizontally encapsulate each other.
      var divb = textDivs[bottom.j];
      if(!this.overlapBy(d.left, divb.left,
                      d.left + d.width,
                      divb.left + divb.width, 0.99)) {
          return false;
      }
      return true;
    },
    
    addToQuadTree: function(o, i, styles) {
      var style = styles[o.fontName];
      if (isAllWhitespace(o.str)) {
        // Whitespace elements aren't visible, but they're used for copy/paste.
        o.isWhitespace = true;
      }
      var tx = o.transform;
      
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

      if (angle === 0) {
        o.x = tx[4];
        o.y = tx[5] - fontAscent;
      } else {
        o.x = tx[4] + (fontAscent * Math.sin(angle));
        o.y = tx[5] - (fontAscent * Math.cos(angle));
      }
      o.id = i; // Used to uniquely identify object.
      this.quadtree.insert(o);
    },
    
    calculateTextFlow: function (bounds, objs, styles) {
      var timeSlotManager = new TimeSlotManager();
      var self = this;
      self.quadtree = new QuadTree(bounds, 4, 16);
      for (var i = 0, len = objs.length; i < len; i++) {
        self.addToQuadTree(objs[i], i, styles);
      }
      self.quadtree.retrieve_lr({x:0, y:0, height:1000}, function(it) { 
            console.log(it.str); 
      });
      return new Promise(function next(resolve, reject) {
        timeSlotManager.reset();
        var stop;
        while (!(stop = timeSlotManager.check())) {
          
          
        
        } // while
        if (stop) {
          deferred.then(function () {
            next(resolve, reject);
          });
          return;
        }
        resolve(textContent);
      });
    }
  };
  return TextLayoutEvaluator;
})();