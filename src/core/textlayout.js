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
      var right_d = right.x - d.x - d.width;
      if(right_d < 1.25*d.width/d.str.length) {
          // If the space to the right less than a char length, not a column.
          return false;
      }
      if(d.width > this.bounds.width/2) {
          // Can't be true if we're so wide.
          return false;
      }
      if(right.d < 1.25*right.width/right.str.length) {
          // If the space to the right less than a char length, not a column.
          return false;
      }
      if(right.width > this.bounds.width/2) {
          // Can't be true if the right is so wide.
          return false;
      }
      // If the horizontal space between d and divr is much smaller than the
      // vertical space between the next legitimate line.
      if(bottom) {
        var bottom_d = d.y + d.height - bottom.y;
        if (right_d < bottom_d && bottom_d < d.height) {
              return false;
        }
      }
      
      if(d.isWhitespace || right.isWhitespace) {
        // we shouldn't enter this... we should skip whitespace first.
          return false;
      }
      
      // We cannot rule out that this is a text column, return true.
      return true;
    },
    
    could_be_next_line : function (d, bottom) {
      // Return true if bottom could be a line directly underneath d.
      if(bottom === null) {
          return false;
      }
      var bottom_d = d.y + d.height - bottom.y;
      // They have to be vertically close
      if(bottom_d > d.height) {
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
      } else {
        // Line numbers can mess up flow, so we detect and handle them them.
        var n = Number(o.str.replace(/^\s+|\s+$/g,''));
        if(n % 1 === 0) {
          o.asInt = n;
        }
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
      o.vertical = style.vertical;
      
      o.id = i;         // Used to uniquely identify object.
      o.right = null;   // The nearest object to the right.
      o.bottom = null;  // The nearest object to the left.
      o.flow = {
        right : null,   // Nearest non-whitespace text to the right
        bottom: null,
        next  : null,
        prev  : null,
      };
          
      this.quadtree.insert(o);
    },
    
    calculateTextFlow: function (bounds, objs, styles) {
      var timeSlotManager = new TimeSlotManager();
      var self = this;
      var calc_reflow = true;
      self.bounds = bounds;
      
      // Put everything into the quadtree so it's fast to look things up.
      self.quadtree = new QuadTree(bounds, 4, 16);
      for (var i = 0, len = objs.length; i < len; i++) {
        self.addToQuadTree(objs[i], i, styles);
      }
      
      // The top item has a big impact on the flow, so track it.
      var top_obj = null;
      // Set each element's padding to run to the nearest right and bottom 
      // element. The padding ensures that text selection works.
      for (i = 0; i < len; i++) {
        var d = objs[i];
        var d_x2 = d.x + d.width;
        var d_y2 = d.y + d.height;
        
        // Keep track of the top most item.
        if(!d.isWhitespace && (top_obj === null || d.y > top_obj.y)) {
            top_obj = d;
        }
        if (!calc_reflow) {
          // Find the first object to the right.
          self.quadtree.retrieve_xinc(d.x+d.width,d.y,d.height, function (dr) {
              if(dr.id !== d.id) {
                d.right = dr.id;
                return false;
              }
          });
          // Find the object directly below, subtract the height to move down.
          self.quadtree.retrieve_ydec(d.x,d.y-d.height,d.width, function (db) {
              if(db.id !== d.id) {
                d.bottom = db.id;
                return false;
              }
          });
        } else {
          // Iterate to the right.
          self.quadtree.retrieve_xinc(d.x+d.width,d.y,d.height, function (dr) {
              if(dr.id !== d.id) {
                // Find the first item to the right.
                if(d.right === null) {
                  d.right = dr.id;
                }
                if(dr.isWhitespace !== true) {
                  // Retrieve the first non whitespace item to the right.
                  d.flow.right = dr.id;
                  return false;
                }
              }
          });
          
          // Iterate down
          self.quadtree.retrieve_ydec(d.x,d.y-d.height,d.width, function (db) {
              if(db.id !== d.id) {
                if(d.bottom === null) {
                  d.bottom = db.id;
                }
                if(db.isWhitespace !== true) {
                  d.flow.bottom = db.id;
                  return false;
                }
              }
          });
          
          if(d.flow.right !== null) {
            objs[d.flow.right].flow.left = d.id;
          }
          if(d.flow.bottom !== null) {
            objs[d.flow.bottom].flow.top = d.id;
          }
        }
      }
      
      if(calc_reflow) {
        // Find the top left-most item.
        while(top_obj && top_obj.flow.left) {
          top_obj = objs[top_obj.flow.left];
        }
        
        for (i = 0; i < len; i++) {
          d = objs[i];
          
          // Put the divs into a linked list based on their order.
          if(d.vertical) {
              // Is there such thing as rows of vertical text? FixMe if so.
              if(d.flow.buttom) {
                  d.flow.next = d.flow.buttom;
              }
          } else if(d.flow.right) {
            if(!self.could_be_column(d, objs[d.flow.right], 
                                      objs[d.flow.bottom])) {
              // Set next to the next object, which may be whitespace. 
              // We don't a want the flow to skip the whitespace.
              d.flow.next = d.right;
            } else if(d.flow.right === i + 1 || d.right === i + 1) {
              // Put effort into finding the next line in the flow
              // it is likely beneath this line or in another column.
              
            }
          } else {
            // No text to the right of this element. Rely on the natural flow.
          }
          // Make the reverse linked list.
          if(d.flow.next) {
              objs[d.flow.next].flow.prev = d.id;
          }
        }
      }
      
      return top_obj ? top_obj.id : null;
    }
  };
  return TextLayoutEvaluator;
})();