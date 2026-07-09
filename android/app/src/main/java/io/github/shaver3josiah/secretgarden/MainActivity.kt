package io.github.shaver3josiah.secretgarden

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.GeolocationPermissions
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader

class MainActivity : AppCompatActivity() {

    private lateinit var webViewContainer: FrameLayout
    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader

    private var pendingGeolocationOrigin: String? = null
    private var pendingGeolocationCallback: GeolocationPermissions.Callback? = null

    private val locationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val origin = pendingGeolocationOrigin
        val callback = pendingGeolocationCallback
        pendingGeolocationOrigin = null
        pendingGeolocationCallback = null
        if (origin != null && callback != null) {
            callback.invoke(origin, granted, false)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)

        val insetsController = WindowInsetsControllerCompat(window, window.decorView)
        insetsController.isAppearanceLightStatusBars = true
        insetsController.isAppearanceLightNavigationBars = true
        window.statusBarColor = ContextCompat.getColor(this, R.color.garden_bg)
        window.navigationBarColor = ContextCompat.getColor(this, R.color.garden_bg)

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webViewContainer = FrameLayout(this)
        setContentView(webViewContainer)

        webView = createWebView()
        webViewContainer.addView(webView)
        webView.loadUrl(START_URL)

        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) {
                webView.goBack()
            } else {
                finish()
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(): WebView {
        val newWebView = WebView(this)
        newWebView.layoutParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )

        val settings = newWebView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.setGeolocationEnabled(true)
        settings.mediaPlaybackRequiresUserGesture = false
        settings.textZoom = 100

        newWebView.webViewClient = createWebViewClient()
        newWebView.webChromeClient = createWebChromeClient()

        return newWebView
    }

    private fun createWebViewClient(): WebViewClient {
        return object : WebViewClient() {

            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val uri = request.url
                if (uri.host == ASSET_HOST) {
                    return false
                }
                startActivity(Intent(Intent.ACTION_VIEW, uri))
                return true
            }

            override fun onRenderProcessGone(
                view: WebView,
                detail: RenderProcessGoneDetail
            ): Boolean {
                if (view !== webView) {
                    return true
                }
                webViewContainer.removeView(webView)
                webView.destroy()
                webView = createWebView()
                webViewContainer.addView(webView)
                webView.loadUrl(START_URL)
                return true
            }
        }
    }

    private fun createWebChromeClient(): WebChromeClient {
        return object : WebChromeClient() {

            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback
            ) {
                val granted = ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.ACCESS_FINE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED

                if (granted) {
                    callback.invoke(origin, true, false)
                    return
                }

                pendingGeolocationOrigin = origin
                pendingGeolocationCallback = callback
                locationPermissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
            }
        }
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val ASSET_HOST = "appassets.androidplatform.net"
        private const val START_URL = "https://appassets.androidplatform.net/assets/www/index.html"
    }
}
