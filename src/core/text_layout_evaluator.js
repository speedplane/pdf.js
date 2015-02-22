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
        function TextLayoutEvaluator_addToQuadTree(quadtree, obj, id, styles) {
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

      // This insert may will fail if inserting an item outside of bounds. 
      // That's okay, because it will not be displayed.
      quadtree.insert(obj);
    },
    
    calculateTextFlow:
        function TextLayoutEvaluator_calculateTextFlow(bounds, objs, styles) {
      var it; // Use iterators to move over the quadtree
      var obj; // Current item
      var objN; // Temp storage for the "next" object.
      
      // Use a quadtree to quickly lookup neighbors.
      var quadtree_vert = new QuadTree(bounds, 4, 16);
      // Populate the first
      for (var i = 0, len = objs.length; i < len; i++) {
        this.addToQuadTree(quadtree_vert, objs[i], i, styles);
      }
      
      for (i = 0; i < len; i++) {
        obj = objs[i];
        
        // Bottom
        it = quadtree_vert.retrieveYDec(obj.x, obj.y, obj.width);
        while (objN = it.next()) {
          if (objN.id !== obj.id) {
            obj.bottom = objN.id;
            break;
          }
        }
        // Top
        // We're looking for items above this item, so start from the top.
        it = quadtree_vert.retrieveYInc(obj.x, obj.y + obj.height, obj.width);
        while (objN = it.next()) {
          if (objN.id !== obj.id) {
            obj.top = objN.id;
            break;
          }
        }
      }
      quadtree_vert = undefined; // Done with this structure, help the GC.
      
      // Build a second quadtree taking into account the fact that we will
      // extend the objects height to reach the nearest neighbors.
      var quadtree_horiz = new QuadTree(bounds, 4, 16);
      // Populate the first
      for (i = 0; i < len; i++) {
        obj = objs[i];
        
        obj.fullHeight = obj.height;
        if (obj.bottom === null) {
            // There is nothing underneath, it starts on the bottom
            obj.fullY = bounds.y;
            obj.fullHeight += obj.y - bounds.y;
        } else if(objs[obj.bottom].y + objs[obj.bottom].height <= obj.y) {
            // There is an item underneath, extend our bottom to its top.
            obj.fullY = objs[obj.bottom].y + objs[obj.bottom].height;
            obj.fullHeight += obj.y - obj.fullY;
        } else {
            // This item overlaps another beneath it. We won't pad it.
            obj.fullY = obj.y;
            obj.fullHeight = obj.height;
        }
        
        quadtree_horiz.insert({
          x: obj.x,
          y: obj.fullY,
          width: obj.width,
          height: obj.fullHeight,
          id: obj.id
        });
      }
      
      // Iterate over the items in the second quadtree to find right/left objs.
      for (i = 0; i < len; i++) {
        obj = objs[i];
        var right = obj.x + obj.width;
        
        // Find the first object to the right. Start looking from the left 
        // edge so we catch any overlapping items.
        it = quadtree_horiz.retrieveXInc(obj.x , obj.fullY, obj.fullHeight);
        while (objN = it.next()) {
          if (objN.id !== obj.id && objN.x + objN.width > right) {
            obj.right = objN.id;
            break;
          }
        }
        // Find the left item. Start from the right edge to find overlaps.
        it = quadtree_horiz.retrieveXDec(right, obj.fullY, obj.fullHeight);
        while (objN = it.next()) {
          if (objN.id !== obj.id && objN.x < obj.x) {
            obj.left = objN.id;
            break;
          }
        }
        
        // Remove these variables that are no longer needed.
        obj.fullY = undefined;
        obj.fullHeight = undefined;
      }
    }
  };
  return TextLayoutEvaluator;
})();
