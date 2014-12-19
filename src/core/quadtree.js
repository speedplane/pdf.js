/*jslint vars: true, nomen: true, plusplus: true, continue:true, forin:true */
/*global Node, QNode */

/*

  Copyright (c) 2014 Michael Sander (speedplane)
  Based loosely on code written by (c) 2011 Mike Chambers.

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

/****************** QuadTree ****************
*
* A QuadTree implementation in JavaScript, a 2d spatial subdivision algorithm.
* @module QuadTree
**/
var QuadTree = (function QuadTreeClosure() {
  /**
  * QuadTree data structure.
  * @class QuadTree
  * @constructor
  * @param {Object} An object representing the top level QuadTree's bounds. The
  *                 object should contain: x, y, width, height and id that 
  *                 uniquely identifies it.
  * @param {Number} maxDepth Max number of levels that the quadtree will create.
  * @param {Number} maxChildren Max children in a node before being split.
  **/
  function QuadTree(bounds, maxDepth, maxChildren) {
      this.root = new QNode(bounds, 0, maxDepth, maxChildren);
      this.length = 0;
  }
  
  // The root node of the QuadTree which covers the entire area being segmented.
  QuadTree.prototype.root = null;
  QuadTree.prototype.length = 0;
  
  /**
  * Inserts an item into the QuadTree.
  **/
  QuadTree.prototype.insert = function (item) {
    if (item instanceof Array) {
      var len = item.length;
      var i;
      for (i = 0; i < len; i++) {
        this.root.insert(item[i]);
        this.length++;
      }
    } else {
        this.root.insert(item);
        this.length++;
    }
  };
  QuadTree.prototype.print = function () {
    var leafs = this.root.print();
    console.log('QuadTree: ' + this.length + ' objects. ' + leafs + ' leafs.');
  }
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
      return this.root.retrieve(item, [], {});
  };
  
  /**
   * Iterate through the items from the left to the right as specified by the 
   * bounding box given by item: x, y, and height.
   */
  QuadTree.prototype.retrieve_lr = function (item, func) {
    var it = {x:item.x, y:item.y, height:item.height, width:QNode.INFDIST};
    return this.root.retrieve_lr(it, func, {});
  }
  
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
  
  // Used to indicate infinite width or height.
  QNode.INFDIST      = -1;
  
  // Collect and concatenate items retrieved so we don't create many new Array 
  // instances. Copy the array when returned from QuadTree.retrieve
  QNode.prototype._out = [];

  ///////////
  // Debugging
  QNode.prototype.print = function () {
    var tabs = '';
    for(var d=0; d < this._depth; d++) {
      tabs += ' ';
    }
    if (this.nodes !== null) {
      var txt={};
      var total_elements = 0;
      txt[QNode.TOP_LEFT]     = 'TOP_LEFT';
      txt[QNode.TOP_RIGHT]    = 'TOP_RIGHT';
      txt[QNode.BOTTOM_LEFT]  = 'BOTTOM_LEFT';
      txt[QNode.BOTTOM_RIGHT] = 'BOTTOM_RIGHT';
      
      for(var i=0; i<this.nodes.length; i++) {
          console.log(tabs + 'Depth ' + this._depth + ' ' + txt[i]);
          total_elements += this.nodes[i].print();
      }
      return total_elements;
    }
    console.log(tabs + 'Leaf with ' + this.children.length + ' elements.');
    return this.children.length;
  };
  
  ///////////
  // Insertion
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
            this.insert(this.children[j]);
        }
        this.children = null; // Don't need it anymore.
    }
  };

  QNode.prototype._findIndices = function (item) {
    // A rectangle can intersect up to four other rectangles. Be sure
    var b       = this.bounds;
    var bx      = b.x + b.width / 2;
    var by      = b.y + b.height / 2;
    
    var out = {};
    var below = false;
    if (item.y < by) {
      var right;
      if (item.x < bx) {
        out[QNode.TOP_LEFT] = true;
        if (item.x + item.width >= bx || item.width == QNode.INFDIST) {
          out[QNode.TOP_RIGHT] = true;
        }
      } else {
        out[QNode.TOP_RIGHT] = true;
      }
    } else {
      below = true;
    }
    
    if (below || item.y + item.height >= by || item.height == QNode.INFDIST) {
      if(item.x < bx) {
        out[QNode.BOTTOM_LEFT] = true;
        if(item.x + item.width >= bx || item.width == QNode.INFDIST) {
          out[QNode.BOTTOM_RIGHT] = true;
        }
      } else {
        out[QNode.BOTTOM_RIGHT] = true;
      }
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
      new QNode({
        x: bx,
        y: by,
        width: b_w_h, height: b_h_h
      }, depth, this._maxDepth, this._maxChildren),
      // TOP_RIGHT
      new QNode({
          x: bx_b_w_h,
          y: by,
          width: b_w_h, height: b_h_h
      }, depth, this._maxDepth, this._maxChildren),
      // BOTTOM_LEFT
      new QNode({
          x: bx,
          y: by_b_h_h,
          width: b_w_h, height: b_h_h
      }, depth, this._maxDepth, this._maxChildren),
      // BOTTOM_RIGHT
      new QNode({
        x: bx_b_w_h,
        y: by_b_h_h,
        width: b_w_h, height: b_h_h
      }, depth, this._maxDepth, this._maxChildren)
    ];
  };
  
  ///////////////////////////////
  // Retrieval
  /**
   * Internal retrieval function.
   * ar       where we store the output.
   * deduper  a dictionary so we can keep track of duplicates.
   */
  QNode.prototype.retrieve = function (item, ar, deduper) {
    if (this.nodes) {
      // Everything should be deduped, that takes place in the leaf node.
      for(var i in this._findIndices(item)) {
        this.nodes[i].retrieve(item, ar, deduper);
      }
      return ar;
    }
    
    // Go through children.
    var children_len = this.children.length;
    var it_x2 = item.x + item.width;
    var it_y2 = item.y + item.height;
    for(var ci=0; ci < children_len; ci++) {
      var c = this.children[ci];
      if(   item.x <= c.x + c.width && 
            item.y <= c.y + c.height && 
            (c.x <= it_x2 || item.width === QNode.INFDIST) &&
            (c.y <= it_y2 || item.height === QNode.INFDIST) && 
            !(c.id in deduper)) {
          deduper[c.id] = true;
          ar.push(c);
      }
    }
    return ar;
  };
  
  QNode.prototype.retrieve_lr = function (item, func, deduper) {
    // Sort right to left.
    var sort_lr = function(a, b) { return a.x < b.x ? -1: (a.x>b.x?1:0); };
    
    function sort_and_callback(items) {
      items.sort(sort_lr);
      var subitems_len = items.length;
      for(var j = 0; j < subitems_len; j++) {
        var sub = items[j];
        if(func(sub) === false) {
          return false;
        }
      }
      return true;
    }
    
    if (this.nodes) {
      var indices = this._findIndices(item);
      
      // Handle the left side.
      if(indices[QNode.TOP_LEFT] && indices[QNode.BOTTOM_LEFT]) {
        // We must retrieve all, sort them, and return one by one.
        var subitemsl = [];
        this.nodes[QNode.TOP_LEFT].retrieve(item, subitemsl, deduper);
        this.nodes[QNode.BOTTOM_LEFT].retrieve(item, subitemsl, deduper);
        if(!sort_and_callback(subitemsl)) {
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
        var subitemsr = [];
        this.nodes[QNode.TOP_RIGHT].retrieve(item, subitemsr, deduper);
        this.nodes[QNode.BOTTOM_LEFT].retrieve(item, subitemsr, deduper);
        if(!sort_and_callback(subitemsr)) {
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
            !(c.id in deduper)) {
          if(func(c) === false) {
            return false;
          }
          deduper[c.id] = true;
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
  
  return QuadTree;
})();