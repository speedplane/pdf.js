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
* A QuadTree implementation in JavaScript that stores rectangular regions.
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
  
  // The root node of the QuadTree covers the entire area being segmented.
  QuadTree.prototype.root = null;
  QuadTree.prototype.length = 0;
  
  /**
  * Inserts an item into the QuadTree.
  * Each element must have an id to uniquely identify it. We don't check to 
  * make ensure that the element has already been added.
  **/
  QuadTree.prototype.insert = function (item) {
    if (item instanceof Array) {
      for (var i = 0, len=item.length; i < len; i++) {
        this.insert(item[i]);
      }
    } else {
      var b = this.root.bounds;
      if (item.x >= b.x+b.width || item.x+item.width <= b.x ||
          item.y >= b.y+b.height || item.y+item.height <= b.y) {
          // Can extend past the bounds, but must be at least partially in it.
          console.error('Failed QuadTree Bounds Check');
          return;
        }
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
  QuadTree.prototype.retrieve_xinc = function (x,y,height) {
    var it = {x:x, y:y, height:height, width:this.root.bounds.width-x};
    var sorter = function(a, b) {return a.x < b.x ? -1: (a.x>b.x?1:0);};
    var side1 = [QNode.TOP_LEFT, QNode.BOTTOM_LEFT];
    var side2 = [QNode.TOP_RIGHT, QNode.BOTTOM_RIGHT];
    return this.root.retrieve_iterate(it, sorter, side1, side2, {});
  };
  QuadTree.prototype.retrieve_xdec = function (x,y,height) {
    var x0 = this.root.bounds.x;
    var it = {x:x0, y:y, height:height, width:x-x0};
    var sorter = function(a, b) {
      var ax=a.x+a.width, bx=b.x+b.width;
      return ax < bx ? 1: (ax>bx?-1:0);};
    var side1 = [QNode.TOP_RIGHT, QNode.BOTTOM_RIGHT];
    var side2 = [QNode.TOP_LEFT, QNode.BOTTOM_LEFT];
    return this.root.retrieve_iterate(it, sorter, side1, side2, {});
  };
  
  /**
   * Iterate through the items with increasing y that intersect the box by: x, 
   * y, and width.
   */
  QuadTree.prototype.retrieve_yinc = function (x,y,width) {
    var it = {x:x, y:y, width:width, height:this.root.bounds.height-y};
    var sorter = function(a, b) { return a.y < b.y ? -1: (a.y>b.y?1:0); };
    var side1 = [QNode.TOP_LEFT,    QNode.TOP_RIGHT];
    var side2 = [QNode.BOTTOM_LEFT, QNode.BOTTOM_RIGHT];
    return this.root.retrieve_iterate(it, sorter, side1, side2, {});
  };
  /**
   * Iterate through the items from the down to up as specified by the 
   * lower left corner of the bounding box given by item: x, y, and width.
   */
  QuadTree.prototype.retrieve_ydec = function (x,y,width) {
    // When decreasing, we're given bottom left corner, convert to top right.
    var y0     = this.root.bounds.y;  // Calculate the top-left corner
    var it = {x:x, y:y0, width:width, height:y-y0};
    var sorter = function(a, b) {
        var ay=a.y+a.height, by=b.y+b.height;
        return ay < by ? 1: (ay>by?-1:0);
    };
    var side1 = [QNode.BOTTOM_LEFT, QNode.BOTTOM_RIGHT];
    var side2 = [QNode.TOP_LEFT,    QNode.TOP_RIGHT];
    return this.root.retrieve_iterate(it, sorter, side1, side2, {});
  };
  
  function QNode(bounds, depth, maxDepth, maxChildren) {
    this.bounds   = bounds;  //  bounds
    this.children = [];     // children contained directly in the node
    this.nodes    = null;   // subnodes
    this._maxChildren = maxChildren || 4;
    this._maxDepth = maxDepth || 4;
    this._depth = depth || 0;
  }
  
  // We consider "top" to be lower y values (screen coords), but if you're 
  // using a different coord system, everything works. If these constants 
  // change, the array in subdivide must too.
  QNode.TOP_LEFT     = 0;
  QNode.TOP_RIGHT    = 1;
  QNode.BOTTOM_LEFT  = 2;
  QNode.BOTTOM_RIGHT = 3;
  
  ///////////
  // Debugging
  QNode.prototype.print = function () {
    var tabs = '';
    for (var d=0; d < this._depth; d++) {
      tabs += ' ';
    }
    if (this.nodes !== null) {
      var txt={};
      var total_elements = 0;
      txt[QNode.TOP_LEFT]     = 'TOP_LEFT';
      txt[QNode.TOP_RIGHT]    = 'TOP_RIGHT';
      txt[QNode.BOTTOM_LEFT]  = 'BOTTOM_LEFT';
      txt[QNode.BOTTOM_RIGHT] = 'BOTTOM_RIGHT';
      
      for (var i=0; i<this.nodes.length; i++) {
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
      for (var i in this._findIndices(item)) {
        this.nodes[i].insert(item);
      }
      return;
    }
    
    // We're a leaf node
    this.children.push(item);
    if (this.children.length >= this._maxChildren &&
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
	// Given the item, return which of the four quadrents the item intersects.
    // Can intersect up to four quadrants. Returns an assoc set.
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
      if (item.x < bx) {
        out[QNode.BOTTOM_LEFT] = true;
        if (item.x + item.width >= bx) {
          out[QNode.BOTTOM_RIGHT] = true;
        }
      } else {
        out[QNode.BOTTOM_RIGHT] = true;
      }
    }
    return out;
  };
  
  QNode.prototype.subdivide = function () {
	// Subdivides this node into four others.
	// Does not redistribute the children.
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
   * Internal retrieval function. Retrieves all elements that intersect item.
   * ar       where we store the output.
   * deduper  a dictionary so we can keep track of duplicates.
   */
  QNode.prototype.retrieve = function (item, ar, deduper) {
    if (this.nodes) {
      // Everything should be deduped, that takes place in the leaf node.
      for (var i in this._findIndices(item)) {
        this.nodes[i].retrieve(item, ar, deduper);
      }
      return ar;
    }
    
    // Go through children.
    var children_len = this.children.length;
    var it_x2 = item.x + item.width;
    var it_y2 = item.y + item.height;
    for (var ci=0; ci < children_len; ci++) {
      var c = this.children[ci];
      if (   item.x < c.x + c.width &&
            item.y < c.y + c.height &&
            it_x2 > c.x && it_y2 > c.y &&
            !(c.id in deduper)) {
          deduper[c.id] = true;
          ar.push(c);
      }
    }
    return ar;
  };
  
  ///////////////////////////////
  // Iteration
  // No matter which way you iterate, for a given node, you know that two of
  // the quadrants will be iterated before the other two.
  function NodeIterator(q, item, sorter, side1, side2, deduper) {
    this.indices = q._findIndices(item);
    this.quad = q;
    
    // If only one iterator type is being used at once, these can be shared.
    this.side1 = side1;
    this.side2 = side2;
    this.item = item;
    this.sorter = sorter;
    this.deduper = deduper;
    
    // Start with the first side, then move to the second
    this.did_side2 = false;
    // Build sub-iterators for the first side's two quandrants.
    this.build_iterators(this.side1);
    // Initialize the iterators to null
    this.lastit0 = null;
    this.lastit1 = null;
  }
  NodeIterator.prototype.build_iterators = function(s) {
    // Build sub-iterators for two of the four quandrants. s indicates which 2.
    this.it0 = this.indices[s[0]] ? this.quad.nodes[s[0]].retrieve_iterate(
      this.item, this.sorter, this.side1, this.side2, this.deduper) : null;
    this.it1 = this.indices[s[1]] ? this.quad.nodes[s[1]].retrieve_iterate(
      this.item, this.sorter, this.side1, this.side2, this.deduper) : null;
  };
  NodeIterator.prototype.next = function() {
    // Get the first item of the two iterators.
    if (this.it0 && !this.lastit0) {
      this.lastit0 = this.it0.next();
    }
    if (this.it1 && !this.lastit1) {
      this.lastit1 = this.it1.next();
    }
    
    var out;
    if (this.lastit0 && this.lastit1) {
      // There are elements in both iterators, return the first.
      if (this.sorter(this.lastit0, this.lastit1) <= 0) {
        out = this.lastit0;
        this.lastit0 = null;
      } else {
        out = this.lastit1;
        this.lastit1 = null;
      }
      return out;
    } else if (this.lastit0) {
      out = this.lastit0;
      this.lastit0 = null;
      return out;
    } else if (this.lastit1) {
      out = this.lastit1;
      this.lastit1 = null;
      return out;
    }
    // There are no more items left for the two iterators.
    // Get the iterator for the other side if we have another side.
    if (!this.did_side2) {
      // Build sub-iterators for the second side's two quandrants.
      this.build_iterators(this.side2);
      this.did_side2 = true;
      return this.next();
    }
    
    // Nothing else to iterate.
    return null;
  };
  NodeIterator.prototype.debug_print = function(depth) {
    if (depth === undefined) {
      depth = 0;
    }
    var spaces = new Array(depth+2).join(' ');
    console.log(spaces + 'Node Iterator depth ' + depth + ': ' +
                (this.it0 ? 'with it0 ':'') + (this.it1 ? 'with it1 ':''));
    console.log(spaces + '-> ' + this.side1 + ' | ' + this.side2);
    if (this.it0) {
      this.it0.debug_print(depth+1);
    }
    if (this.it1) {
      this.it1.debug_print(depth+1);
    }
  };
  function LeafIterator(item, children, deduper) {
    this.children = children;
    this.children_len = children.length;
    this.it_x1 = item.x;
    this.it_y1 = item.y;
    this.it_x2 = item.x + item.width;
    this.it_y2 = item.y + item.height;
    this.ci = 0;
    this.deduper = deduper;
    return this;
  }
  LeafIterator.prototype.next = function() {
    // Return the iterator that goes through all children.
    while(this.ci < this.children_len) {
      var c = this.children[this.ci];
      this.ci++;
      if (   this.it_x1 < c.x + c.width &&
            this.it_y1 < c.y + c.height &&
            this.it_x2 > c.x && this.it_y2 > c.y &&
            !(c.id in this.deduper)) {
        this.deduper[c.id] = true;
        return c;
      }
    }
    return null;
  };
  
  /**
   * A function that iterates through the items in any direction.
   * Its complexity is O(logN) for a single iteration.
   */
  QNode.prototype.retrieve_iterate = function (item,
                              sorter, side1, side2, deduper) {
    if (this.nodes) {
      return new NodeIterator(this, item, sorter, side1, side2, deduper);
    }
    
    this.children.sort(sorter);
    // Iterate through children.
    return new LeafIterator(item, this.children, deduper);
  };
  LeafIterator.prototype.debug_print = function(depth) {
    if (depth === undefined) {
      depth = 0;
    }
    var spaces = new Array(depth).join(' ');
    console.log(spaces + 'LeafIterator depth ' + depth + ': ' +
                this.children.length + ' items');
  };
  
  return QuadTree;
})();