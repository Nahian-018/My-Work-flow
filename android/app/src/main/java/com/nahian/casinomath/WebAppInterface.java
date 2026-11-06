package com.nahian.casinomath;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Vibrator;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

public class WebAppInterface {
    private final MainActivity activity;

    public WebAppInterface(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public boolean checkOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return Settings.canDrawOverlays(activity);
        }
        return true;
    }

    @JavascriptInterface
    public void requestOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(activity)) {
                Intent intent = new Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + activity.getPackageName())
                );
                activity.startActivityForResult(intent, MainActivity.REQUEST_OVERLAY_CODE);
            } else {
                Toast.makeText(activity, "Overlay permission is already granted!", Toast.LENGTH_SHORT).show();
            }
        }
    }

    @JavascriptInterface
    public void startFloatingWidget() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(activity)) {
            Toast.makeText(activity, "দয়া করে 'Display over other apps' অনুমতি দিন", Toast.LENGTH_LONG).show();
            requestOverlayPermission();
            return;
        }

        Intent intent = new Intent(activity, FloatingGuideService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            activity.startForegroundService(intent);
        } else {
            activity.startService(intent);
        }
        Toast.makeText(activity, "ভাসমান অ্যাসিস্ট্যান্ট চালু হয়েছে! স্ক্রিনে উইজেট দেখুন।", Toast.LENGTH_SHORT).show();
    }

    @JavascriptInterface
    public void stopFloatingWidget() {
        Intent intent = new Intent(activity, FloatingGuideService.class);
        activity.stopService(intent);
        Toast.makeText(activity, "ভাসমান অ্যাসিস্ট্যান্ট বন্ধ করা হয়েছে", Toast.LENGTH_SHORT).show();
    }

    @JavascriptInterface
    public void vibrate(int milliseconds) {
        Vibrator vibrator = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator != null) {
            vibrator.vibrate(milliseconds);
        }
    }

    @JavascriptInterface
    public void showToast(String message) {
        Toast.makeText(activity, message, Toast.LENGTH_LONG).show();
    }
}
