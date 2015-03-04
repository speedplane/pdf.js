/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* globals PDFJS, expect, it, describe, Promise, combineUrl, waitsFor,
           isArray, MissingPDFException */

'use strict';

function waitsForPromiseResolved(promise, successCallback) {
  var data;
  promise.then(function(val) {
    data = val;
    successCallback(data);
  },
  function(error) {
    // Shouldn't get here.
    expect(false).toEqual(true);
  });
  waitsFor(function() {
    return data !== undefined;
  }, 20000);
}

describe('text-extract', function() {
  var pdfURL = combineUrl(window.location.href, '../pdfs/US6205527_page1.pdf');
  var resolvePromise;
  var pagePromise = new Promise(function (resolve) {
    resolvePromise = resolve;
  });
  PDFJS.getDocument(pdfURL).then(function(doc) {
    doc.getPage(1).then(function(data) {
      resolvePromise(data);
    });
  });
  var page;
  waitsForPromiseResolved(pagePromise, function(data) {
    page = data;
  });
  it('gets text content', function () {
      waitsForPromiseResolved(pagePromise, function (data) {
        var textPromise = page.getTextContent();
        waitsForPromiseResolved(textPromise, function (data) {
          expect(!!data.items).toEqual(true);
          var text = data.items.map(function (d) { return d.str; }).join('');
          // Make sure the text is ordered properly.
          expect(text.indexOf('Disclosed is an apparatus, a system, a') > 0)
            .toEqual(true);
          expect(text.indexOf('device to the computer system; (b) preparing ' +
            'a storage. media of the peripheral storage') > 0).toEqual(true);
        });
      });
    });
});