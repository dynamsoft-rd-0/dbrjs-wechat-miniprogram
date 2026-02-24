// pages/index/index.js
// Main package entry - redirects to scan page in subpackage

Page({
  onLoad: function () {
    // Redirect to the scan page in subpackage
    wx.redirectTo({
      url: '/barcode-reader-sample/pages/test/index'
    });
  }
});
