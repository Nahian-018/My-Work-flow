# CasinoMath - Android APK Build Guide

This directory contains the complete native Android Studio WebView project for the Live Casino Math Companion.

## Option 1: Instant APK without Android Studio (PWABuilder)
1. Go to [https://www.pwabuilder.com/](https://www.pwabuilder.com/)
2. Enter the Live URL of this application.
3. Click **Package for Android (APK)**.
4. Download the signed `.apk` file directly to your phone.

## Option 2: Build using Android Studio
1. Open Android Studio.
2. Select **Open an existing Project** and select this `android/` directory.
3. Wait for Gradle to sync.
4. Go to **Build** -> **Build Bundle(s) / APK(s)** -> **Build APK(s)**.
5. Transfer the generated `.apk` from `app/build/outputs/apk/debug/app-debug.apk` to your phone.
