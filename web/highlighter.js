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

  // To release any cyclic memory
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

  // For debugging: draw divs for all segments
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

  // For debugging: draw divs with text for all text segments
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
        // Highlights already enabled for this page
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
  // TODO: A very specific fix which should be generalized, see 
  // https://github.com/peerlibrary/peerlibrary/issues/664
    /* We traverse from the end and search for segments which should be before 
    the first segment and mark them unselectable. The rationale is that those 
    segments which are spatially positioned before the first segment, but are 
    out-of-order in the array are watermarks or headers and other elements not 
    connected with the content, but they interfere with highlighting. It seems 
    they are simply appended at the end so we search them only near the end. 
    We still allow unselectable segments to be selected in the browser if user 
    is directly over it.
    See https://github.com/peerlibrary/peerlibrary/issues/387

    Few segments can be correctly ordered among those at the end. For example, 
    page numbers. 
    */
    var segment, threshold, _i, _ref, _results;
    // segments, currently chosen completely arbitrary (just that it is larger than 1)
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
    // We still want to allow unselectable segments to be selected in the
    // browser if user is directly over it, so we go over all segments here.
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
  
  // Finds a text layer segment which is it to the left and up of the given position
  // and has highest index. Highest index means it is latest in the text flow of the
  // page. So we are searching for for latest text layer segment in text flow on the
  // page before the given position. Left and up is what is intuitively right for
  // text which flows left to right, top to bottom.
  Page.prototype._findLastLeftUpTextSegment = function(position) {
    var index, segment, segmentIndex, _i, _len, _ref;
    segmentIndex = -1;
    _ref = this.textSegments;
    for (index = _i = 0, _len = _ref.length; _i < _len; index = ++_i) {
      // We allow few additional pixels so that position can be slightly to the left
      // of the text segment. This helps when user is with mouse between two columns
      // of text. With this the text segment to the right (in the right column) is
      // still selected when mouse is a bit to the left of the right column. Otherwise
      // selection would immediately jump the the left column. Good text editors put
      // this location when selection switches from right column to left column to the
      // middle between columns, but we do not really have information about the columns
      // so we at least make it a bit easier to the user. The only issue would be if
      // columns would be so close that those additional pixels would move into the left
      // column. This is unlikely if we keep the number small.
      segment = _ref[index];
      if (!segment.unselectable) {
        if (segment.boundingBox.left <= position.left + 10 * this.viewport.scale && segment.boundingBox.top <= position.top && index > segmentIndex) {
          segmentIndex = index;
        }
      }
    }
    return segmentIndex;
  };

  // Simple search for closest text layer segment by euclidean distance
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

  // Pads a text layer segment (identified by index) so that its padding comes
  // under the position of the mouse. This makes text selection in browsers
  // behave like mouse is still over the text layer segment DOM element, even
  // when mouse is moved from it, for example, when dragging selection over empty
  // space in pages where there are no text layer segments.
  Page.prototype._padTextSegment = function(position, index) {
    var $dom, angle, distance, left, padding, scaleX, segment, top;
    segment = this.textSegments[index];
    distance = this._distance(position, segment.boundingBox);
    $dom = segment.$domElement;

    // Text layer segments can be rotated and scaled along x-axis
    angle = segment.angle;
    scaleX = segment.scaleX;

    // Padding is scaled later on, so we apply scaling inversely here so that it 
    // is exact after scaling later on. Without that when scaling is < 1, when 
    // user moves far away from the text segment, padding falls behind and does 
    // not reach mouse position anymore. Additionally, we add few pixels so 
    // that user can move mouse fast and still stay in.
    padding = distance / scaleX + 20 * this.viewport.scale;

    // Padding (and text) rotation transformation is done through CSS and
    // we have to match it for margin, so we compute here margin under rotation.
    // 2D vector rotation: http://www.siggraph.org/education/materials/HyperGraph/modeling/mod_tran/2drota.htm
    // x' = x cos(f) - y sin(f), y' = x sin(f) + y cos(f)
    // Additionally, we use CSS scaling transformation along x-axis on padding
    // (and text), so we have to scale margin as well.
    left = padding * (scaleX * Math.cos(angle) - Math.sin(angle));
    top = padding * (scaleX * Math.sin(angle) + Math.cos(angle));
    
    this.$displayPage.find('.text-layer-segment').css({
      padding: 0,
      margin: 0
    });

    // Optimization if position is to the right and down of the segment. We do this
    // because modifying both margin and padding slightly jitters text segment around
    // because of rounding to pixel coordinates (text is scaled and rotated so margin
    // and padding values do not fall nicely onto pixel coordinates).
    if (segment.boundingBox.left <= position.left && segment.boundingBox.top <= position.top) {
      $dom.css({
        paddingRight: padding,
        paddingBottom: padding
      });
      return;
    }

    // Otherwise we apply padding all around the text segment DOM element and 
    // do not really care where the mouse position is, we have to change both 
    // margin and padding anyway.
    // We counteract text content position change introduced by padding by setting
    // negative margin. With this, text content stays in place, but DOM element gets a
    // necessary padding.
    return $dom.css({
      marginLeft: -left,
      marginTop: -top,
      padding: padding
    });
  };

  Page.prototype.padTextSegments = function(event) {
    var position, segment, segmentIndex, skippedUnselectable, _ref;
    
    position = this._eventToPosition(event);

    // First check if we are directly above a text segment. We could combine this
    // with _findLastLeftUpTextSegment below, but we also want to handle the case
    // when we are directly above an unselectable segment.
    segmentIndex = this._overTextSegment(position);

    if (segmentIndex !== -1) {
      this._padTextSegment(position, segmentIndex);
      return;
    }
    
    // Find latest text layer segment in text flow on the page before the given position
    segmentIndex = this._findLastLeftUpTextSegment(position);

    // segmentIndex might be -1, but @_distanceY returns infinity in this case, 
    // so things work out
    if (this._distanceY(position, (_ref = this.textSegments[segmentIndex]) != null ? _ref.boundingBox : void 0) === 0) {
      // A clear case, we are directly over a segment y-wise. This means that
      // segment is to the left of mouse position (because we searched for
      // all segments to the left and up of the position and we already checked
      // if we are directly over a segment). This is the segment we want to pad.
      this._padTextSegment(position, segmentIndex);
      return;
    }
    
    // So we are close to the segment we want to pad, but we might currently have
    // a segment which is in the middle of the text line above our position, so we
    // search for the last text segment in that line, before it goes to the next
    // (our, where our position is) line.
    // On the other hand, segmentIndex might be -1 because we are on the left border
    // of the page and there are no text segments to the left and up. So we as well
    // do a search from the beginning of the page to the last text segment on the
    // text line just above our position.
    // We keep track of the number of skipped unselectable segments to not increase
    // segmentIndex until we get to a selectable segment again (if we do at all).
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
    
    // segmentIndex can still be -1 if there are no text segments before
    // the mouse position, so let's simply find closest segment and pad that.
    // Not necessary for Chrome. There you can start selecting without being
    // over any text segment and it will correctly start when you move over
    // one. But in Firefox you have to start selecting over a text segment
    // (or padded text segment) to work correctly later on.
    if (segmentIndex === -1) {
      segmentIndex = this._findClosestTextSegment(position);
    }
    
    // segmentIndex can still be -1 if there are no text segments on
    // the page at all, then we do not have aynthing to do
    if (segmentIndex !== -1) {
      this._padTextSegment(position, segmentIndex);
    }
    return null; // Make sure we don't return anything
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
    
    // There is no use rendering so many divs to make browser useless
    // TODO: Report this to the server? Or should we simply discover such 
    // PDFs already on the server when processing them?
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
    
    // Annotator.TextPositionAnchor does not seem to be set globally from the
    // TextPosition's pluginInit, so let's do it here again
    // TODO: Can this be fixed somehow?
    Annotator.TextPositionAnchor = this._annotator.plugins.TextPosition.Annotator.TextPositionAnchor;
    
    if (isPdf) {
      $(window).on('scroll.highlighter resize.highlighter', this.checkRender);
    }
  }

  Highlighter.prototype.destroy = function() {
    var page, _i, _len, _ref, _ref1, _ref2;
    $(window).off('.highlighter');
    
    // We stop handles here and not just leave it to Deps.autorun to do it to 
    // cleanup in the right order
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
    this._numPages = null; // To disable any asynchronous _checkHighlighting
    if (this._annotator) {
      this._annotator.destroy();
    }
    this._annotator = null; // To release any cyclic memory
    return this._$displayWrapper = null; // To release any cyclic memory
  };

  Highlighter.prototype.setNumPages = function(_numPages) {
    this._numPages = _numPages;
  };

  Highlighter.prototype.getNumPages = function() {
    return this._numPages;
  };

  Highlighter.prototype.setPage = function(viewport, pdfPage) {
    // Initialize the page
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
      // If page is just in process of being rendered, we skip it
      page = _ref[_i];
      
      if (page.rendering) {
        continue;
      }
      
      // Page is not yet ready
      if (!page.highlightsEnabled) {
        continue;
      }
      $canvas = page.$displayPage.find('canvas');
      
      canvasTop = $canvas.offset().top;
      canvasBottom = canvasTop + $canvas.height();
      
      // Add 500px so that we start rendering early
      if (canvasTop - 500 <= $(window).scrollTop() + $(window).height() && canvasBottom + 500 >= $(window).scrollTop()) {
        pagesToRender.push(page);
      } else {
        // TODO: Only if page is not having a user selection (multipage selection in progress)
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
    // We update the mapper for new page
    return (_ref = this._annotator) != null ? (_ref1 = _ref.domMapper) != null ? _ref1.pageRendered(page.pageNumber) : void 0 : void 0;
  };

  Highlighter.prototype.pageRemoved = function(page) {
    var _ref, _ref1;
    // We update the mapper for removed page
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
