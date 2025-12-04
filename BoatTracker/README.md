# BoatTracker - Mobile App

A React Native mobile application built with Expo that displays real-time boat tracking data from Firebase.

## Features

- **Split-screen layout**: Map on the left, boat details on the right
- **Real-time updates**: Connects to Firebase Realtime Database for live boat data
- **Interactive map**: Click on boat markers to view detailed information
- **Boat details display**: Shows ID, latitude, longitude, temperature, humidity, timestamp, and more
- **Cross-platform**: Runs on both Android and iOS via Expo Go

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- Expo CLI: `npm install -g expo-cli`
- Expo Go app installed on your Android or iOS device

### Installation

1. Navigate to the project directory:
   ```bash
   cd BoatTracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running the App

1. Start the Expo development server:
   ```bash
   npm start
   ```

2. On your Android device, open Expo Go and scan the QR code displayed in the terminal.

3. On your iOS device, open the Camera app and scan the QR code, then tap the notification to open in Expo Go.

## Project Structure

- `App.js` - Main application component with map and details panel
- `app.json` - Expo configuration
- `package.json` - Project dependencies and scripts

## Firebase Setup

The app connects to Firebase Realtime Database at:
```
https://boattracker-e296c-default-rtdb.firebaseio.com
```

**Database Structure Expected:**
```
boats/
  {boatId}/
    latest/
      timestamp: "2025-12-04 12:34:56"
      counter: 123
      lat: 10.3157
      lon: 123.8854
      temperature: 28.5
      humidity: 65.2
      sos: 0
      rssi: -95
    history/
      {pushKey}/
        timestamp: "2025-12-04 12:34:56"
        ...
```

## Features Explained

### Map Display
- Shows all boats as green markers
- Selected boat marker turns red for visibility
- Tap anywhere on the map to deselect a boat

### Boat Details Panel
- Displays comprehensive information about the selected boat
- Shows real-time updates as data changes in Firebase
- Displays SOS status with color coding (red for active, green for OK)

## Supported Coordinates

The app expects latitude and longitude as numeric values (not integers). Your ESP32 code sends integer coordinates, so you may want to:
1. Modify your ESP32 code to send float values with decimal places (e.g., multiply by 1000000 and divide in the app)
2. Or update the app to handle integer coordinates if needed

For example, if your coordinates are 10.3157, send them as `10315700` (multiply by 1000000) in the ESP32 code.

## Troubleshooting

- **Map not showing**: Ensure Firebase is connected and contains valid boat data
- **Markers not appearing**: Check that latitude and longitude values are valid numbers
- **Real-time updates not working**: Verify Firebase Realtime Database is in test mode (rules allow read/write)
- **No markers on map**: Make sure boat data includes `latest.lat` and `latest.lon` fields

## Notes

- The app uses Expo's built-in location services to show user location on the map
- Map permissions will be requested on first run
- Ensure your Firebase database is accessible in test mode (no authentication required)

## Development

To enable maps to work properly on both platforms, you may need to obtain Google Maps API keys:
- Update `ios.config.googleMapsApiKey` in `app.json` for iOS
- Update `android.config.googleMaps.apiKey` in `app.json` for Android

However, react-native-maps typically works without API keys in development mode through Expo.
