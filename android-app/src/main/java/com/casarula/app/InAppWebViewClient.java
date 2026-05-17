package com.casarula.app;

import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

// Named subclass so d8 doesn't choke on the anonymous-class metadata.
// All app navigation stays inside the WebView; we never hand off to an
// external browser since this app is designed as a single-purpose kiosk.
public class InAppWebViewClient extends WebViewClient {
    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        view.loadUrl(request.getUrl().toString());
        return true;
    }
}
