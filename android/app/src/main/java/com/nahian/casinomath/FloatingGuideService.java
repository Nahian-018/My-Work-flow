package com.nahian.casinomath;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public class FloatingGuideService extends Service {
    private WindowManager windowManager;
    private View floatingView;
    private WindowManager.LayoutParams params;
    private static final String CHANNEL_ID = "CasinoMathFloatingChannel";

    // Session State
    private int balance = 5000;
    private int startBankroll = 5000;
    private int consecutiveLosses = 0;
    private TextView tvBalance;
    private TextView tvStatus;
    private LinearLayout expandedLayout;
    private boolean isExpanded = false;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @SuppressLint("ClickableViewAccessibility")
    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startForeground(1001, buildForegroundNotification());

        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        initFloatingLayout();
    }

    private void initFloatingLayout() {
        // Main container
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#EE111827"));
        root.setPadding(16, 16, 16, 16);

        // Header / Draggable Bubble
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);

        TextView tvBubble = new TextView(this);
        tvBubble.setText("🎯 CM Live");
        tvBubble.setTextColor(Color.parseColor("#10B981"));
        tvBubble.setTextSize(13);
        tvBubble.setPadding(12, 8, 12, 8);
        header.addView(tvBubble);

        Button btnToggle = new Button(this);
        btnToggle.setText("≡");
        btnToggle.setTextSize(12);
        btnToggle.setTextColor(Color.WHITE);
        btnToggle.setBackgroundColor(Color.parseColor("#374151"));
        btnToggle.setOnClickListener(v -> toggleExpand());
        header.addView(btnToggle);

        root.addView(header);

        // Expandable content
        expandedLayout = new LinearLayout(this);
        expandedLayout.setOrientation(LinearLayout.VERTICAL);
        expandedLayout.setVisibility(View.GONE);
        expandedLayout.setPadding(0, 12, 0, 0);

        tvBalance = new TextView(this);
        tvBalance.setText("ব্যালেন্স: ৳ ৫,০০০");
        tvBalance.setTextColor(Color.WHITE);
        tvBalance.setTextSize(14);
        expandedLayout.addView(tvBalance);

        tvStatus = new TextView(this);
        tvStatus.setText("সেশন: নিরাপদ (১%-২% রুল)");
        tvStatus.setTextColor(Color.parseColor("#34D399"));
        tvStatus.setTextSize(11);
        tvStatus.setPadding(0, 4, 0, 8);
        expandedLayout.addView(tvStatus);

        // Win / Loss Fast Buttons
        LinearLayout btnRow = new LinearLayout(this);
        btnRow.setOrientation(LinearLayout.HORIZONTAL);

        Button btnWin = new Button(this);
        btnWin.setText("+ WIN");
        btnWin.setBackgroundColor(Color.parseColor("#059669"));
        btnWin.setTextColor(Color.WHITE);
        btnWin.setOnClickListener(v -> recordResult(100));
        btnRow.addView(btnWin);

        Button btnLoss = new Button(this);
        btnLoss.setText("- LOSS");
        btnLoss.setBackgroundColor(Color.parseColor("#DC2626"));
        btnLoss.setTextColor(Color.WHITE);
        btnLoss.setOnClickListener(v -> recordResult(-100));
        btnRow.addView(btnLoss);

        expandedLayout.addView(btnRow);

        Button btnClose = new Button(this);
        btnClose.setText("বন্ধ করুন (Close)");
        btnClose.setTextSize(10);
        btnClose.setTextColor(Color.parseColor("#94A3B8"));
        btnClose.setBackgroundColor(Color.TRANSPARENT);
        btnClose.setOnClickListener(v -> stopSelf());
        expandedLayout.addView(btnClose);

        root.addView(expandedLayout);
        floatingView = root;

        // Overlay Window Parameters
        int layoutFlag;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            layoutFlag = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        } else {
            layoutFlag = WindowManager.LayoutParams.TYPE_PHONE;
        }

        params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                layoutFlag,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT
        );

        params.gravity = Gravity.TOP | Gravity.START;
        params.x = 20;
        params.y = 150;

        windowManager.addView(floatingView, params);

        // Drag to move
        header.setOnTouchListener(new View.OnTouchListener() {
            private int initialX, initialY;
            private float initialTouchX, initialTouchY;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = params.x;
                        initialY = params.y;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        params.x = initialX + (int) (event.getRawX() - initialTouchX);
                        params.y = initialY + (int) (event.getRawY() - initialTouchY);
                        windowManager.updateViewLayout(floatingView, params);
                        return true;
                }
                return false;
            }
        });
    }

    private void toggleExpand() {
        isExpanded = !isExpanded;
        expandedLayout.setVisibility(isExpanded ? View.VISIBLE : View.GONE);
    }

    private void recordResult(int change) {
        balance += change;
        tvBalance.setText("ব্যালেন্স: ৳ " + balance);

        if (change > 0) {
            consecutiveLosses = 0;
            tvStatus.setText("উইন! লাভ: +৳ " + (balance - startBankroll));
            tvStatus.setTextColor(Color.parseColor("#10B981"));
        } else {
            consecutiveLosses++;
            if (consecutiveLosses >= 3) {
                tvStatus.setText("🚨 " + consecutiveLosses + "x হার! বাজি বাড়াবেন না!");
                tvStatus.setTextColor(Color.parseColor("#EF4444"));
                Toast.makeText(this, "⚠️ পরপর ৩ বার হার! লস রিকভারির জন্য বাজি দ্বিগুণ করবেন না!", Toast.LENGTH_LONG).show();
            } else {
                tvStatus.setText("লস: ৳ " + change);
                tvStatus.setTextColor(Color.parseColor("#F59E0B"));
            }
        }

        // Stop Loss Trigger (-30%)
        if (balance <= startBankroll * 0.70) {
            Toast.makeText(this, "🚨 স্টপ-লস ট্রিগার হয়েছে! খেলা বন্ধ করুন!", Toast.LENGTH_LONG).show();
            tvStatus.setText("🚨 স্টপ-লস শেষ! টেবিল ছাড়ুন!");
            tvStatus.setTextColor(Color.RED);
        }
    }

    private Notification buildForegroundNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, notificationIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
        );

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        return builder.setContentTitle("CasinoMath ভাসমান অ্যাসিস্ট্যান্ট")
                .setContentText("গেমের উপর লাইভ ডিসিপ্লিন গাইড চালু আছে")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(pendingIntent)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "CasinoMath Floating Guide Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (floatingView != null && windowManager != null) {
            windowManager.removeView(floatingView);
        }
    }
}
