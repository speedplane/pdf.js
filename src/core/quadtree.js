/*jslint vars: true, nomen: true, plusplus: true, continue:true, forin:true */
/*global Node, QNode */

/*

  Copyright (c) 2014 Michael Sander (speedplane)
  Based on code written by (c) 2011 Mike Chambers.

  The MIT License
  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
  THE SOFTWARE.
*/

'use strict';

/**
* A QuadTree implementation in JavaScript, a 2d spatial subdivision algorithm.
* @module QuadTree
**/
(function (window) {
  /****************** QuadTree ****************/

  /**
  * QuadTree data structure.
  * @class QuadTree
  * @constructor
  * @param {Object} An object representing the top level QuadTree's bounds. The
  *                 object should contain: x, y, width, height.
  * @param {Number} maxDepth Max number of levels that the quadtree will create.
  * @param {Number} maxChildren Max children in a node before being split.
  **/
  function QuadTree(bounds, maxDepth, maxChildren) {
      this.root = new QNode(bounds, 0, maxDepth, maxChildren);
  }
  
  // The root node of the QuadTree which covers the entire area being segmented.
  QuadTree.prototype.root = null;

  /**
  * Inserts an item into the QuadTree.
  **/
  QuadTree.prototype.insert = function (item) {
    if (item instanceof Array) {
      var len = item.length;
      var i;
      for (i = 0; i < len; i++) {
        this.root.insert(item[i]);
      }
    } else {
        this.root.insert(item);
    }
  };

  QuadTree.prototype.clear = function () {
      this.root.clear();
  };

  /**
  * Retrieve all items in the same node as the specified item. If it overlaps 
  * multiple nodes, then all children in will be returned.
  * @method retrieve
  * @param {Object} item A rect with x, y, width, height properties.
  **/
  QuadTree.prototype.retrieve = function (item) {
      // Get a copy of the array of items
      return this.root.retrieve(item).slice(0);
  };
  
  function QNode(bounds, depth, maxDepth, maxChildren) {
    this.bounds   = bounds;  //  bounds
    this.children = [];     // children contained directly in the node
    this.nodes    = null;   // subnodes
    this._maxChildren = maxChildren || 4;
    this._maxDepth = maxDepth || 4;
    this._depth = depth || 0;
  }
  
  // If these constants are changed, the array in subdivide must too.
  QNode.TOP_LEFT     = 0;
  QNode.TOP_RIGHT    = 1;
  QNode.BOTTOM_LEFT  = 2;
  QNode.BOTTOM_RIGHT = 3;
  
  // Collect and concatenate items retrieved so we don't create many new Array 
  // instances. Copy the array when returned from QuadTree.retrieve
  QNode.prototype._out = [];

  QNode.prototype.insert = function (item) {
    if (this.nodes !== null) {
      // This is a node, insert into subnodes
      // We may need to insert into more than one if it straddles borders.
      for(var i in this._findIndices(item)) {
        this.nodes[i].insert(item);
      }
      return;
    }
    
    // We're a leaf node
    this.children.push(item);
    if(this.children.length >= this._maxChildren &&
                                this._depth < this._maxDepth) {
        // This will turn this from a leaf node into a node.
        this.subdivide();
        // Do inserts now that this is a subdivided node.
        var j;
        var children_len = this.children.length;
        for (j = 0; j < children_len; j++) {
            this.insert(this.children[i]);
        }
        this.children = null; // Don't need it anymore.
    }
  };

  QNode.prototype._findIndices = function (item) {
    // A rectangle can intersect up to four other rectangles. Be sure
    var b       = this.bounds;
    var top     = item.y < b.y + b.height / 2;
    var left    = item.x < b.x + b.width / 2;
    var bottom  = item.y + item.height >= b.y + b.height / 2 ||
                     item.height === -1;
    var right   = item.x + item.width  >= b.x + b.width / 2 ||
                      item.width === -1;
    
    var out = {};
    if(top && left) {
      out[QNode.TOP_LEFT] = true;
    }
    if(top && right) {
      out[QNode.TOP_RIGHT] = true;
    }
    if(bottom && left) {
      out[QNode.BOTTOM_LEFT] = true;
    }
    if(bottom && right) {
      out[QNode.BOTTOM_RIGHT] = true;
    }
    return out;
  };
  
  QNode.prototype.subdivide = function () {
    var depth = this._depth + 1;

    var bx = this.bounds.x;
    var by = this.bounds.y;

    // Floor the values
    var b_w_h = (this.bounds.width / 2) | 0;
    var b_h_h = (this.bounds.height / 2) | 0;
    var bx_b_w_h = bx + b_w_h;
    var by_b_h_h = by + b_h_h;
    
    
    this.nodes = [
      // TOP_LEFT
      new this.QNode({
        x: bx,
        y: by,
        width: b_w_h, height: b_h_h
      }, depth, this._maxDepth, this._maxChildren),
      // TOP_RIGHT
      new this.QNode({
          x: bx_b_w_h,
          y: by,
          width: b_w_h, height: b_h_h
      }, depth, this._maxDepth, this._maxChildren),
      // BOTTOM_LEFT
      new this.QNode({
          x: bx,
          y: by_b_h_h,
          width: b_w_h, height: b_h_h
      }, depth, this._maxDepth, this._maxChildren),
      // BOTTOM_RIGHT
      new this.QNode({
        x: bx_b_w_h,
        y: by_b_h_h,
        width: b_w_h, height: b_h_h
      }, depth, this._maxDepth, this._maxChildren)
    ];
  };
  
  ///////////////////////////////
  // Retrieval
  QNode.prototype.retrieve = function (item, _deduper) {
    var deduper = _deduper || {};
    var out = this._out; // Don't create a new array object
    out.length = 0;
    
    if (this.nodes) {
      // We need to dedup those that straddles borders.
      for(var i in this._findIndices(item)) {
        var subitems = this.nodes[i].retrieve(item, deduper);
        var subitems_len = subitems.length;
        for(var j = 0; j < subitems_len; j++) {
          var s = subitems[j];
          if(!(s in deduper)) {
            deduper[s] = true;
            out.push(s);
          }
        }
      }
      return out;
    }
    
    // Go through children.
    var children_len = this.children.length;
    var it_x2 = item.x + item.width;
    var it_y2 = item.y + item.height;
    for(var ci=0; ci < children_len; ci++) {
      var c = this.children[ci];
      if(item.x <= c.x + c.width && c.x <= it_x2 &&
          item.y <= c.y + c.height && c.y <= it_y2 && !(c in deduper)) {
          deduper[c] = true;
          out.push(c);
      }
    }
    return out;
  };
  
  QNode.prototype.retrieve_lr = function (item, func, _deduper) {
    var deduper = _deduper || {};
    var sort_lr = function(a, b) { return a.x < b.x ? -1: (a.x>b.x?1:0); };
    
    function sort_and_callback(items) {
      items.sort(sort_lr);
      var subitems_len = items.length;
      for(var j = 0; j < subitems_len; j++) {
        var sub = items[j];
        if(!deduper[sub] && !func(sub)) {
          return false;
        }
        deduper[sub] = true;
      }
      return true;
    }
    
    if (this.nodes) {
      item.width = -1;
      var indices = this._findIndices(item, true);
      var subitems = this._out;
      subitems.length = 0;
      
      // Handle the left side.
      if(indices[QNode.TOP_LEFT] && indices[QNode.BOTTOM_LEFT]) {
        // We must retrieve all, sort them, and return one by one.
        Array.prototype.push.apply(subitems,
              this.nodes[QNode.TOP_LEFT].retrieve(item, deduper));
        Array.prototype.push.apply(subitems,
              this.nodes[QNode.BOTTOM_LEFT].retrieve(item, deduper));
        if(!sort_and_callback(subitems)) {
          return false;
        }
      } else if(indices[QNode.TOP_LEFT]) {
        // We only need to look at one quartile.
        if(!this.nodes[QNode.TOP_LEFT].retrieve_lr(item, func, deduper)) {
          return false;
        }
      } else if(indices[QNode.BOTTOM_LEFT]) {
        // We only need to look at one quartile.
        if(!this.nodes[QNode.BOTTOM_LEFT].retrieve_lr(item, func, deduper)) {
          return false;
        }
      }
      
      // Handle the right side.
      if(indices[QNode.TOP_RIGHT] && indices[QNode.BOTTOM_RIGHT]) {
        // We must retrieve all, sort them, and return one by one.
        Array.prototype.push.apply(subitems,
              this.nodes[QNode.TOP_RIGHT].retrieve(item, deduper));
        Array.prototype.push.apply(subitems,
              this.nodes[QNode.BOTTOM_LEFT].retrieve(item, deduper));
        if(!sort_and_callback(subitems)) {
          return false;
        }
      } else if(indices[QNode.TOP_RIGHT]) {
        // We only need to look at one quartile.
        if(!this.nodes[QNode.TOP_RIGHT].retrieve_lr(item, func, deduper)) {
          return false;
        }
      } else if(indices[QNode.BOTTOM_RIGHT]) {
        // We only need to look at one quartile.
        if(!this.nodes[QNode.BOTTOM_RIGHT].retrieve_lr(item, func, deduper)) {
          return false;
        }
      }
      return true;
    }
    
    // Go through children.
    this.children.sort(sort_lr);
    var children_len = this.children.length;
    var it_y2 = item.y + item.height;
    for(var ci=0; ci < children_len; ci++) {
      var c = this.children[ci];
      if(item.x <= c.x + c.width &&
            item.y <= c.y + c.height && c.y <= it_y2 &&
            !(c in deduper)) {
          if(!func(c)) {
            return false;
          }
      }
    }
    return true;
  };
  
  // Clearing
  QNode.prototype.clear_gc = function () {
    // Clear, but let the GC do most of the work.
    this.children.length = 0;
    this.nodes.length = 0;
  };
  
  QNode.prototype.clear = function () {
    // Be more proacive in our clearing.
    this.children.length = 0;
    var len = this.nodes.length;
    for (var i = 0; i < len; i++) {
        this.nodes[i].clear();
    }
    this.nodes.length = 0;
  };

  window.QuadTree = QuadTree;

}(window));