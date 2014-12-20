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
  QuadTree.prototype.retrieve_xinc = function (x,y,height, func) {
    var it = {x:x, y:y, height:height, width:this.root.bounds.width-x};
    var sorter = function(a, b) {return a.x < b.x ? -1: (a.x>b.x?1:0);};
    var side1 = [QNode.TOP_LEFT, QNode.BOTTOM_LEFT];
    var side2 = [QNode.TOP_RIGHT, QNode.BOTTOM_RIGHT];
    return this.root.retrieve_iterate(it, func, sorter, side1, side2, {});
  };
  QuadTree.prototype.retrieve_xdec = function (x,y,height, func) {
    var x0 = this.root.bounds.x;
    var it = {x:x0, y:y, height:height, width:x-x0};
    var sorter = function(a, b) {return a.x < b.x ? 1: (a.x>b.x?-1:0);};
    var side1 = [QNode.TOP_RIGHT, QNode.BOTTOM_RIGHT];
    var side2 = [QNode.TOP_LEFT, QNode.BOTTOM_LEFT];
    return this.root.retrieve_iterate(it, func, sorter, side1, side2, {});
  };
  
  /**
   * Iterate through the items from the top down as specified by the 
   * bounding box given by item: x, y, and width.
   */
  QuadTree.prototype.retrieve_yinc = function (x,y,width, func) {
    var it = {x:x, y:y, width:width, height:this.root.bounds.height-y};
    var sorter = function(a, b) { return a.y < b.y ? -1: (a.y>b.y?1:0); };
    var side1 = [QNode.BOTTOM_LEFT, QNode.BOTTOM_RIGHT];
    var side2 = [QNode.TOP_LEFT,    QNode.TOP_RIGHT];
    return this.root.retrieve_iterate(it, func, sorter, side1, side2, {});
  };
  /**
   * Iterate through the items from the down to up as specified by the 
   * lower left corner of the bounding box given by item: x, y, and width.
   */
  QuadTree.prototype.retrieve_ydec = function (x,y,width, func) {
    // When decreasing, we're given bottom left corner, convert to top right.
    var y0     = this.root.bounds.y;  // Calculate the top-left corner
    var it = {x:x, y:y0, width:width, height:y-y0};
    var sorter = function(a, b) { return a.y < b.y ? 1: (a.y>b.y?-1:0); };
    var side1 = [QNode.TOP_LEFT,    QNode.TOP_RIGHT];
    var side2 = [QNode.BOTTOM_LEFT, QNode.BOTTOM_RIGHT];
    return this.root.retrieve_iterate(it, func, sorter, side1, side2, {});
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
        if (item.x + item.width >= bx) {
          out[QNode.TOP_RIGHT] = true;
        }
      } else {
        out[QNode.TOP_RIGHT] = true;
      }
    } else {
      below = true;
    }
    
    if (below || item.y + item.height >= by) {
      if(item.x < bx) {
        out[QNode.BOTTOM_LEFT] = true;
        if(item.x + item.width >= bx) {
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
      if(   item.x < c.x + c.width &&
            item.y < c.y + c.height &&
            it_x2 > c.x && it_y2 > c.y &&
            !(c.id in deduper)) {
          deduper[c.id] = true;
          ar.push(c);
      }
    }
    return ar;
  };
  
  QNode.prototype.sort_and_callback = function (items, func, cmp) {
    items.sort(cmp);
    var subitems_len = items.length;
    for(var j = 0; j < subitems_len; j++) {
      var sub = items[j];
      if(func(sub) === false) {
        return false;
      }
    }
    return true;
  };
  
  /**
   * A fancier function to iterate through the items with increasing x pos.
   * The worst case complexity of this function is O(NlogN) for a single 
   * iteration, but it is usually much faster than that when the height is not
   * very large and the likelihood of crossing a boundary is relatively small.
   */
  QNode.prototype.retrieve_iterate = function (item, func,
                              sorter, side1, side2, deduper) {
    // Sort right to left.
    var sort_lr = function(a, b) { return a.x < b.x ? -1: (a.x>b.x?1:0); };
    
    if (this.nodes) {
      var indices = this._findIndices(item);
      
      // Handle the first side of the quandrants.
      if(indices[side1[0]] && indices[side1[1]]) {
        // We must retrieve all, sort them, and return one by one. 
        // This can be improved by not looking at the entire width at once.
        var sub_l = [];
        this.nodes[side1[0]].retrieve(item, sub_l, deduper);
        this.nodes[side1[1]].retrieve(item, sub_l, deduper);
        if(!this.sort_and_callback(sub_l, func, sorter)) {
          return false;
        }
      } else if(indices[side1[0]]) {
        // We only need to look at one quartile.
        if(!this.nodes[side1[0]].retrieve_iterate(item, func,
              sorter, side1, side2, deduper)) {
          return false;
        }
      } else if(indices[side1[1]]) {
        // We only need to look at one quartile.
        if(!this.nodes[side1[1]].retrieve_iterate(item, func,
              sorter, side1, side2, deduper)) {
          return false;
        }
      }
      
      // Handle the second side of the quadrants.
      if(indices[side2[0]] && indices[side2[1]]) {
        // We must retrieve all, sort them, and return one by one.
        var sub_r = [];
        this.nodes[side2[0]].retrieve(item, sub_r, deduper);
        this.nodes[side2[1]].retrieve(item, sub_r, deduper);
        if(!this.sort_and_callback(sub_r, func, sorter)) {
          return false;
        }
      } else if(indices[side2[0]]) {
        // We only need to look at one quartile.
        if(!this.nodes[QNode.TOP_RIGHT].retrieve_iterate(item, func,
              sorter, side1, side2, deduper)) {
          return false;
        }
      } else if(indices[side2[1]]) {
        // We only need to look at one quartile.
        if(!this.nodes[side2[1]].retrieve_iterate(item, func,
              sorter, side1, side2, deduper)) {
          return false;
        }
      }
      return true;
    }
    
    // Go through children.
    this.children.sort(sorter);
    var children_len = this.children.length;
    var it_x2 = item.x + item.width;
    var it_y2 = item.y + item.height;
    for(var ci=0; ci < children_len; ci++) {
      var c = this.children[ci];
      if(   item.x < c.x + c.width &&
            item.y < c.y + c.height &&
            it_x2 > c.x && it_y2 > c.y &&
            !(c.id in deduper)) {
          if(func(c) === false) {
            return false;
          }
          deduper[c.id] = true;
      }
    }
    return true;
  };
  
  return QuadTree;
})();