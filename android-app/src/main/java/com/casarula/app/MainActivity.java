package com.casarula.app;

import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

public class MainActivity extends Activity implements View.OnSystemUiVisibilityChangeListener {
    private static final String START_URL = "https://r.casarula.com";
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // Edge-to-edge: tell the window to draw under the system bars so
        // the WebView gets the full screen height. Without this the
        // system nav bar (back/home/recents) reserves space at the bottom
        // and clips the bottom nav of the app on devices like the Lenovo
        // Idea Tab Pro.
        getWindow().getDecorView().setSystemUiVisibility(buildImmersiveFlags());

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " CasaRulaApp/1.0");

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new InAppWebViewClient());

        // If the user swipes from the edge to reveal the system bars
        // (which IMMERSIVE_STICKY allows), reapply the immersive flags
        // as soon as the system hides them again. Implemented as a method
        // on the Activity itself (rather than an anonymous class) because
        // d8 chokes on anonymous-listener metadata for some Java 11 builds.
        getWindow().getDecorView().setOnSystemUiVisibilityChangeListener(this);

        setContentView(web);
        web.loadUrl(START_URL);
    }

    @Override
    public void onSystemUiVisibilityChange(int visibility) {
        if ((visibility & View.SYSTEM_UI_FLAG_FULLSCREEN) == 0) {
            getWindow().getDecorView().setSystemUiVisibility(buildImmersiveFlags());
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            // Reapply on regaining focus (e.g. after a notification panel
            // pull-down or returning from a dialog).
            getWindow().getDecorView().setSystemUiVisibility(buildImmersiveFlags());
        }
    }

    private int buildImmersiveFlags() {
        return View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
