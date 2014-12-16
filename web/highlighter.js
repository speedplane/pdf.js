var MAX_TEXT_LAYER_SEGMENTS_TO_RENDER, Page,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

MAX_TEXT_LAYER_SEGMENTS_TO_RENDER = 100000;

Page = (function() {
  function Page(highlighter, viewport, pdfPage) {
    this.highlighter = highlighter;
    this.viewport = viewport;
    this.pdfPage = pdfPage;
    this.remove = __bind(this.remove, this);
    this.render = __bind(this.render, this);
    this.isRendered = __bind(this.isRendered, this);
    this.padTextSegments = __bind(this.padTextSegments, this);
    this._padTextSegment = __bind(this._padTextSegment, this);
    this._findClosestTextSegment = __bind(this._findClosestTextSegment, this);
    this._findLastLeftUpTextSegment = __bind(this._findLastLeftUpTextSegment, this);
    this._overTextSegment = __bind(this._overTextSegment, this);
    this._eventToPosition = __bind(this._eventToPosition, this);
    this._distance = __bind(this._distance, this);
    this._distanceY = __bind(this._distanceY, this);
    this._distanceX = __bind(this._distanceX, this);
    this._cleanTextSegments = __bind(this._cleanTextSegments, this);
    this._generateTextSegments = __bind(this._generateTextSegments, this);
    this._enableHighlights = __bind(this._enableHighlights, this);
    this._showTextSegments = __bind(this._showTextSegments, this);
    this._showSegments = __bind(this._showSegments, this);
    this.extractText = __bind(this.extractText, this);
    this.hasTextContent = __bind(this.hasTextContent, this);
    this.imageLayer = __bind(this.imageLayer, this);
    this.destroy = __bind(this.destroy, this);
    this.pageNumber = this.pdfPage.pageNumber;
    this.textContent = null;
    this.textSegments = [];
    this.imageSegments = [];
    this.textSegmentsDone = false;
    this.imageLayerDone = null;
    this.highlightsEnabled = false;
    this.rendering = false;
    this._extractedText = null;
    this.$displayPage = $("#display-page-" + this.pageNumber, this.highlighter._$displayWrapper);
  }

  Page.prototype.destroy = function() {
    this.highlighter = null;
    this.pdfPage = null;
    return this.$displayPage = null;
  };

  Page.prototype.imageLayer = function() {
    return {
      beginLayout: (function(_this) {
        return function() {
          return _this.imageLayerDone = false;
        };
      })(this),
      endLayout: (function(_this) {
        return function() {
          _this.imageLayerDone = true;
          return _this._enableHighlights();
        };
      })(this),
      appendImage: (function(_this) {
        return function(geom) {
          return _this.imageSegments.push(PDFJS.pdfImageSegment(geom));
        };
      })(this)
    };
  };

  Page.prototype.hasTextContent = function() {
    return this.textContent !== null;
  };

  Page.prototype.extractText = function() {
    if (this._extractedText !== null) {
      return this._extractedText;
    }
    return this._extractedText = PDFJS.pdfExtractText(this.textContent);
  };

  Page.prototype._showSegments = function() {
    var divs, segment;
    divs = (function() {
      var _i, _len, _ref, _results;
      _ref = this.textSegments;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        segment = _ref[_i];
        _results.push($('<div/>').addClass('segment text-segment').css(segment.boundingBox));
      }
      return _results;
    }).call(this);
    this.$displayPage.append(divs);
    divs = (function() {
      var _i, _len, _ref, _results;
      _ref = this.imageSegments;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        segment = _ref[_i];
        _results.push($('<div/>').addClass('segment image-segment').css(segment.boundingBox));
      }
      return _results;
    }).call(this);
    return this.$displayPage.append(divs);
  };

  Page.prototype._showTextSegments = function() {
    var divs, segment;
    divs = (function() {
      var _i, _len, _ref, _results;
      _ref = this.textSegments;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        segment = _ref[_i];
        _results.push($('<div/>').addClass('segment text-segment').css(segment.style).text(segment.text));
      }
      return _results;
    }).call(this);
    return this.$displayPage.append(divs);
  };

  Page.prototype._enableHighlights = function() {
    if (!(this.textSegmentsDone && this.imageLayerDone)) {
      return;
    }
    if (this.highlightsEnabled) {
      return;
    }
    return this.highlightsEnabled = true;
  };

  Page.prototype._generateTextSegments = function() {
    var geom, segment, _i, _len, _ref;
    _ref = this.textContent.items;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      geom = _ref[_i];
      segment = PDFJS.pdfTextSegment(this.viewport, geom, this.textContent.styles);
      if (segment.isWhitespace || !segment.hasArea) {
        continue;
      }
      this.textSegments.push(segment);
    }
    this._cleanTextSegments();
    return this.textSegmentsDone = true;
  };

  Page.prototype._cleanTextSegments = function() {
    var segment, threshold, _i, _ref, _results;
    threshold = 5;
    _ref = this.textSegments;
    _results = [];
    for (_i = _ref.length - 1; _i >= 0; _i += -1) {
      segment = _ref[_i];
      if (segment.boundingBox.left >= this.textSegments[0].boundingBox.left && segment.boundingBox.top >= this.textSegments[0].boundingBox.top) {
        threshold--;
        if (threshold === 0) {
          break;
        }
        continue;
      }
      _results.push(segment.unselectable = true);
    }
    return _results;
  };

  Page.prototype._distanceX = function(position, area) {
    var distanceX, distanceXLeft, distanceXRight;
    if (!area) {
      return Number.POSITIVE_INFINITY;
    }
    distanceXLeft = Math.abs(position.left - area.left);
    distanceXRight = Math.abs(position.left - (area.left + area.width));
    if (position.left > area.left && position.left < area.left + area.width) {
      distanceX = 0;
    } else {
      distanceX = Math.min(distanceXLeft, distanceXRight);
    }
    return distanceX;
  };

  Page.prototype._distanceY = function(position, area) {
    var distanceY, distanceYBottom, distanceYTop;
    if (!area) {
      return Number.POSITIVE_INFINITY;
    }
    distanceYTop = Math.abs(position.top - area.top);
    distanceYBottom = Math.abs(position.top - (area.top + area.height));
    if (position.top > area.top && position.top < area.top + area.height) {
      distanceY = 0;
    } else {
      distanceY = Math.min(distanceYTop, distanceYBottom);
    }
    return distanceY;
  };

  Page.prototype._distance = function(position, area) {
    var distanceX, distanceY;
    if (!area) {
      return Number.POSITIVE_INFINITY;
    }
    distanceX = this._distanceX(position, area);
    distanceY = this._distanceY(position, area);
    return Math.sqrt(distanceX * distanceX + distanceY * distanceY);
  };

  Page.prototype._eventToPosition = function(event) {
    var $canvas, offset;
    $canvas = this.$displayPage.find('canvas');
    offset = $canvas.offset();
    return {
      left: event.pageX - offset.left,
      top: event.pageY - offset.top
    };
  };

  Page.prototype._overTextSegment = function(position) {
    var index, segment, segmentIndex, _i, _len, _ref;
    segmentIndex = -1;
    _ref = this.textSegments;
    for (index = _i = 0, _len = _ref.length; _i < _len; index = ++_i) {
      segment = _ref[index];
      if (this._distanceX(position, segment.boundingBox) + this._distanceY(position, segment.boundingBox) === 0) {
        segmentIndex = index;
        break;
      }
    }
    return segmentIndex;
  };

  Page.prototype._findLastLeftUpTextSegment = function(position) {
    var index, segment, segmentIndex, _i, _len, _ref;
    segmentIndex = -1;
    _ref = this.textSegments;
    for (index = _i = 0, _len = _ref.length; _i < _len; index = ++_i) {
      segment = _ref[index];
      if (!segment.unselectable) {
        if (segment.boundingBox.left <= position.left + 10 * this.viewport.scale && segment.boundingBox.top <= position.top && index > segmentIndex) {
          segmentIndex = index;
        }
      }
    }
    return segmentIndex;
  };

  Page.prototype._findClosestTextSegment = function(position) {
    var closestDistance, closestSegmentIndex, distance, index, segment, _i, _len, _ref;
    closestSegmentIndex = -1;
    closestDistance = Number.POSITIVE_INFINITY;
    _ref = this.textSegments;
    for (index = _i = 0, _len = _ref.length; _i < _len; index = ++_i) {
      segment = _ref[index];
      if (!(!segment.unselectable)) {
        continue;
      }
      distance = this._distance(position, segment.boundingBox);
      if (distance < closestDistance) {
        closestSegmentIndex = index;
        closestDistance = distance;
      }
    }
    return closestSegmentIndex;
  };

  Page.prototype._padTextSegment = function(position, index) {
    var $dom, angle, distance, left, padding, scaleX, segment, top;
    segment = this.textSegments[index];
    distance = this._distance(position, segment.boundingBox);
    $dom = segment.$domElement;
    angle = segment.angle;
    scaleX = segment.scaleX;
    padding = distance / scaleX + 20 * this.viewport.scale;
    left = padding * (scaleX * Math.cos(angle) - Math.sin(angle));
    top = padding * (scaleX * Math.sin(angle) + Math.cos(angle));
    this.$displayPage.find('.text-layer-segment').css({
      padding: 0,
      margin: 0
    });
    if (segment.boundingBox.left <= position.left && segment.boundingBox.top <= position.top) {
      $dom.css({
        paddingRight: padding,
        paddingBottom: padding
      });
      return;
    }
    return $dom.css({
      marginLeft: -left,
      marginTop: -top,
      padding: padding
    });
  };

  Page.prototype.padTextSegments = function(event) {
    var position, segment, segmentIndex, skippedUnselectable, _ref;
    position = this._eventToPosition(event);
    segmentIndex = this._overTextSegment(position);
    if (segmentIndex !== -1) {
      this._padTextSegment(position, segmentIndex);
      return;
    }
    segmentIndex = this._findLastLeftUpTextSegment(position);
    if (this._distanceY(position, (_ref = this.textSegments[segmentIndex]) != null ? _ref.boundingBox : void 0) === 0) {
      this._padTextSegment(position, segmentIndex);
      return;
    }
    skippedUnselectable = 0;
    while (this.textSegments[segmentIndex + skippedUnselectable + 1]) {
      segment = this.textSegments[segmentIndex + skippedUnselectable + 1];
      if (segment.unselectable) {
        skippedUnselectable++;
      } else {
        segmentIndex += skippedUnselectable;
        skippedUnselectable = 0;
        if (segment.boundingBox.top + segment.boundingBox.height > position.top) {
          break;
        } else {
          segmentIndex++;
        }
      }
    }
    if (segmentIndex === -1) {
      segmentIndex = this._findClosestTextSegment(position);
    }
    if (segmentIndex !== -1) {
      this._padTextSegment(position, segmentIndex);
    }
  };

  Page.prototype.isRendered = function() {
    if (!this.highlightsEnabled) {
      return false;
    }
    if (this.rendering) {
      return false;
    }
    return !this.$displayPage.find('.text-layer-dummy').is(':visible');
  };

  Page.prototype.render = function() {
    var $textLayerDummy, divs, index, segment;
    assert(this.highlightsEnabled);
    $textLayerDummy = this.$displayPage.find('.text-layer-dummy');
    if (!$textLayerDummy.is(':visible')) {
      return;
    }
    if (this.rendering) {
      return;
    }
    this.rendering = true;
    $textLayerDummy.hide();
    divs = (function() {
      var _i, _len, _ref, _results;
      _ref = this.textSegments;
      _results = [];
      for (index = _i = 0, _len = _ref.length; _i < _len; index = ++_i) {
        segment = _ref[index];
        _results.push(segment.$domElement = $('<div/>').addClass('text-layer-segment').css(segment.style).text(segment.text).data({
          pageNumber: this.pageNumber,
          index: index
        }));
      }
      return _results;
    }).call(this);
    if (divs.length <= MAX_TEXT_LAYER_SEGMENTS_TO_RENDER) {
      this.$displayPage.find('.text-layer').append(divs);
    }
    this.$displayPage.on('mousemove.highlighter', this.padTextSegments);
    this.rendering = false;
    return this.highlighter.pageRendered(this);
  };

  Page.prototype.remove = function() {
    var $textLayerDummy, segment, _i, _len, _ref;
    assert(!this.rendering);
    $textLayerDummy = this.$displayPage.find('.text-layer-dummy');
    if ($textLayerDummy.is(':visible')) {
      return;
    }
    this.$displayPage.off('mousemove.highlighter');
    this.$displayPage.find('.text-layer').empty();
    _ref = this.textSegments;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      segment = _ref[_i];
      segment.$domElement = null;
    }
    $textLayerDummy.show();
    return this.highlighter.pageRemoved(this);
  };

  return Page;

})();

this.Highlighter = (function() {
  function Highlighter(_$displayWrapper, isPdf) {
    this._$displayWrapper = _$displayWrapper;
    this.highlightRemoved = __bind(this.highlightRemoved, this);
    this.highlightChanged = __bind(this.highlightChanged, this);
    this.highlightAdded = __bind(this.highlightAdded, this);
    this.pageRemoved = __bind(this.pageRemoved, this);
    this.pageRendered = __bind(this.pageRendered, this);
    this._checkHighlighting = __bind(this._checkHighlighting, this);
    this.isPageRendered = __bind(this.isPageRendered, this);
    this.checkRender = __bind(this.checkRender, this);
    this.imageLayer = __bind(this.imageLayer, this);
    this.textLayer = __bind(this.textLayer, this);
    this.extractText = __bind(this.extractText, this);
    this.getTextLayer = __bind(this.getTextLayer, this);
    this.hasTextContent = __bind(this.hasTextContent, this);
    this.setTextContent = __bind(this.setTextContent, this);
    this.setPage = __bind(this.setPage, this);
    this.getNumPages = __bind(this.getNumPages, this);
    this.setNumPages = __bind(this.setNumPages, this);
    this.destroy = __bind(this.destroy, this);
    this._pages = [];
    this._numPages = null;
    this.mouseDown = false;
    this._highlightsHandle = null;
    this._highlightLocationHandle = null;
    this._annotator = new Annotator(this, this._$displayWrapper);
    this._annotator.addPlugin('CanvasTextHighlights');
    this._annotator.addPlugin('DomTextMapper');
    this._annotator.addPlugin('TextAnchors');
    this._annotator.addPlugin('TextRange');
    this._annotator.addPlugin('TextPosition');
    this._annotator.addPlugin('TextQuote');
    this._annotator.addPlugin('DOMAnchors');
    if (isPdf) {
      this._annotator.addPlugin('PeerLibraryPDF');
    }
    Annotator.TextPositionAnchor = this._annotator.plugins.TextPosition.Annotator.TextPositionAnchor;
    if (isPdf) {
      $(window).on('scroll.highlighter resize.highlighter', this.checkRender);
    }
  }

  Highlighter.prototype.destroy = function() {
    var page, _i, _len, _ref, _ref1, _ref2;
    $(window).off('.highlighter');
    if ((_ref = this._highlightsHandle) != null) {
      _ref.stop();
    }
    this._highlightsHandle = null;
    if ((_ref1 = this._highlightLocationHandle) != null) {
      _ref1.stop();
    }
    this._highlightLocationHandle = null;
    _ref2 = this._pages;
    for (_i = 0, _len = _ref2.length; _i < _len; _i++) {
      page = _ref2[_i];
      page.destroy();
    }
    this._pages = [];
    this._numPages = null;
    if (this._annotator) {
      this._annotator.destroy();
    }
    this._annotator = null;
    return this._$displayWrapper = null;
  };

  Highlighter.prototype.setNumPages = function(_numPages) {
    this._numPages = _numPages;
  };

  Highlighter.prototype.getNumPages = function() {
    return this._numPages;
  };

  Highlighter.prototype.setPage = function(viewport, pdfPage) {
    return this._pages[pdfPage.pageNumber - 1] = new Page(this, viewport, pdfPage);
  };

  Highlighter.prototype.setTextContent = function(pageNumber, textContent) {
    this._pages[pageNumber - 1].textContent = textContent;
    this._pages[pageNumber - 1]._generateTextSegments();
    return this._checkHighlighting();
  };

  Highlighter.prototype.hasTextContent = function(pageNumber) {
    var _ref;
    return (_ref = this._pages[pageNumber - 1]) != null ? _ref.hasTextContent() : void 0;
  };

  Highlighter.prototype.getTextLayer = function(pageNumber) {
    return this._pages[pageNumber - 1].$displayPage.find('.text-layer').get(0);
  };

  Highlighter.prototype.extractText = function(pageNumber) {
    return this._pages[pageNumber - 1].extractText();
  };

  Highlighter.prototype.textLayer = function(pageNumber) {
    return this._pages[pageNumber - 1].textLayer();
  };

  Highlighter.prototype.imageLayer = function(pageNumber) {
    return this._pages[pageNumber - 1].imageLayer();
  };

  Highlighter.prototype.checkRender = function() {
    var $canvas, canvasBottom, canvasTop, page, pagesToRemove, pagesToRender, _i, _j, _k, _len, _len1, _len2, _ref;
    pagesToRender = [];
    pagesToRemove = [];
    _ref = this._pages;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      page = _ref[_i];
      if (page.rendering) {
        continue;
      }
      if (!page.highlightsEnabled) {
        continue;
      }
      $canvas = page.$displayPage.find('canvas');
      canvasTop = $canvas.offset().top;
      canvasBottom = canvasTop + $canvas.height();
      if (canvasTop - 500 <= $(window).scrollTop() + $(window).height() && canvasBottom + 500 >= $(window).scrollTop()) {
        pagesToRender.push(page);
      } else {
        pagesToRemove.push(page);
      }
    }
    for (_j = 0, _len1 = pagesToRender.length; _j < _len1; _j++) {
      page = pagesToRender[_j];
      page.render();
    }
    for (_k = 0, _len2 = pagesToRemove.length; _k < _len2; _k++) {
      page = pagesToRemove[_k];
      page.remove();
    }
  };

  Highlighter.prototype.isPageRendered = function(pageNumber) {
    var _ref;
    return (_ref = this._pages[pageNumber - 1]) != null ? _ref.isRendered() : void 0;
  };

  Highlighter.prototype._checkHighlighting = function() {
    if (this._pages.length !== this._numPages) {
      return;
    }
    if (!_.every(this._pages, function(page) {
      return page.hasTextContent();
    })) {
      return;
    }
    this._annotator._scan();
    this._highlightsHandle = Highlight.documents.find({
      'publication._id': Session.get('currentPublicationId')
    }).observeChanges({
      added: (function(_this) {
        return function(id, fields) {
          return _this.highlightAdded(id, fields);
        };
      })(this),
      changed: (function(_this) {
        return function(id, fields) {
          return _this.highlightChanged(id, fields);
        };
      })(this),
      removed: (function(_this) {
        return function(id) {
          return _this.highlightRemoved(id);
        };
      })(this)
    });
    return this._highlightLocationHandle = Deps.autorun((function(_this) {
      return function() {
        return _this._annotator._selectHighlight(Session.get('currentHighlightId'));
      };
    })(this));
  };

  Highlighter.prototype.pageRendered = function(page) {
    var _ref, _ref1;
    return (_ref = this._annotator) != null ? (_ref1 = _ref.domMapper) != null ? _ref1.pageRendered(page.pageNumber) : void 0 : void 0;
  };

  Highlighter.prototype.pageRemoved = function(page) {
    var _ref, _ref1;
    return (_ref = this._annotator) != null ? (_ref1 = _ref.domMapper) != null ? _ref1.pageRemoved(page.pageNumber) : void 0 : void 0;
  };

  Highlighter.prototype.highlightAdded = function(id, fields) {
    if (this._annotator.hasAnnotation(id)) {
      return this.highlightChanged(id, fields);
    } else {
      return this._annotator._highlightAdded(id, fields);
    }
  };

  Highlighter.prototype.highlightChanged = function(id, fields) {
    return this._annotator._highlightChanged(id, fields);
  };

  Highlighter.prototype.highlightRemoved = function(id) {
    return this._annotator._highlightRemoved(id);
  };

  return Highlighter;

})();
