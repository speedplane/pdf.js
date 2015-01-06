/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2015 Mozilla Foundation
 * Copyright 2015 Michael Sander (speedplane)
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
/* globals QuadTree */
 
'use strict';
 
var TextLayoutEvaluator = (function TextLayoutEvaluatorClosure() {
  function TextLayoutEvaluator() {
  }
 
  TextLayoutEvaluator.prototype = {
    addToQuadTree:
        function TextLayoutEvaluator_addToQuadTree(obj, id, styles) {
      var style = styles[obj.fontName];
      var tx = obj.transform;
      
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

      // Set y,x to the bottom left. They're the smaller values.
      obj.y = tx[5];
      obj.x = (angle === 0) ? tx[4] :
                              (tx[4] + (fontAscent * Math.sin(angle)));
      obj.vertical = style.vertical;
      
      obj.id = id;         // Used to uniquely identify object.
      obj.right = null;   // The nearest object to the right.
      obj.bottom = null;  // The nearest object to the bottom.
          
      this.quadtree.insert(obj);
    },
    
    calculateTextFlow:
        function TextLayoutEvaluator_calculateTextFlow(bounds, objs, styles) {
      var self = this;
      self.bounds = bounds;
      
      // Put everything into the quadtree for O(logN) positional look ups.
      self.quadtree = new QuadTree(bounds, 4, 16);
      for (var i = 0, len = objs.length; i < len; i++) {
        self.addToQuadTree(objs[i], i, styles);
      }
      
      // Set each element's padding to run to the nearest right and bottom 
      // element. The padding ensures that text selection works.
      for (i = 0; i < len; i++) {
        var obj = objs[i];
        
        // We use iterators to move over the quadtree
        var it;
        // Temp storage for the "next" object.
        var objN;
        
        // Find the first object to the right.
        it = self.quadtree.retrieveXInc(obj.x + obj.width, obj.y, obj.height);
        while (objN = it.next()) {
          if (objN.id !== obj.id) {
            obj.right = objN.id;
            break;
          }
        }
        // Find the left.
        it = self.quadtree.retrieveXDec(obj.x, obj.y, obj.height);
        while (objN = it.next()) {
          if (objN.id !== obj.id) {
            obj.left = objN.id;
            break;
          }
        }
        
        // If item has no right or left, its padding takes up the entire line.
        var x = obj.x;
        var width = obj.width;
        if (obj.left === undefined) {
          // Add the space to the left.
          x = bounds.x;
          width += obj.x;
        }
        if (obj.right === null) {
          // Add space to the right.
          width += bounds.width - (obj.x + obj.width);
        }
        
        // Bottom
        it = self.quadtree.retrieveYDec(x, obj.y, width);
        while (objN = it.next()) {
          if (objN.id !== obj.id) {
            obj.bottom = objN.id;
            break;
          }
        }
        // Top
        // We're looking for items above this item, so start from the top.
        it = self.quadtree.retrieveYInc(x, obj.y + obj.height, width);
        while (objN = it.next()) {
          if (objN.id !== obj.id) {
            obj.top = objN.id;
            break;
          }
        }
      }
    }
  };
  return TextLayoutEvaluator;
})();
