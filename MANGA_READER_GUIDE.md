# MangaReader App

A React Native mobile application for reading manga with chapter navigation and library management.

## Features

- 📚 Personal manga library with cover images
- 🖼️ Fast image loading with caching
- 📖 Chapter-by-chapter reading experience
- 🔄 Navigation between pages and chapters
- 💾 Local data storage
- 🌐 Server-based manga scraping

## Prerequisites

Before running this app, ensure you have:

- Node.js (v20.15.0 or higher recommended)
- React Native development environment set up
- Android Studio (for Android development)
- An Android emulator or physical device
- Backend server running on `http://192.168.1.7:3000` (update IPs in code if needed)

## Installation

1. **Install dependencies:**
   ```bash
   cd "MANGA READER"
   npm install
   ```

2. **Link native modules (Android):**
   ```bash
   npx react-native run-android
   ```

## Configuration

### Update Server URL

The app connects to a backend server. Update the server URL in these files if needed:

- `Library.tsx` - Line 68: `http://192.168.1.7:3000/scrape`
- `MangaReader.tsx` - Line 17: `http://192.168.1.7:3000`

Replace `192.168.1.7` with your actual server IP address.

### Permissions

The app requires the following Android permissions (already configured):
- INTERNET - for fetching manga data
- READ_EXTERNAL_STORAGE - for reading saved data
- WRITE_EXTERNAL_STORAGE - for saving manga library

## Running the App

### Android

1. **Start Metro bundler:**
   ```bash
   npm start
   ```

2. **Run on Android (in a new terminal):**
   ```bash
   npx react-native run-android
   ```

   Or use the pre-configured command:
   ```bash
   cd "C:\Users\Johnn\Desktop\MANGA READER" && npx react-native run-android
   ```

## Project Structure

```
MANGA READER/
├── App.tsx              # Main navigation setup
├── Library.tsx          # Library screen with manga grid
├── MangaReader.tsx      # Manga reader screen with page navigation
├── android/             # Android native code
├── ios/                 # iOS native code (if needed)
└── package.json         # Dependencies
```

## Dependencies

Main dependencies installed:
- `@react-navigation/native` - Navigation framework
- `@react-navigation/stack` - Stack navigator
- `axios` - HTTP client for API requests
- `react-native-fs` - File system access
- `react-native-fast-image` - Optimized image loading
- `@react-native-picker/picker` - Chapter picker component
- `react-native-gesture-handler` - Gesture handling
- `react-native-screens` - Native screen optimization
- `react-native-safe-area-context` - Safe area handling

## How to Use

1. **Add Manga:**
   - Tap the "+" button in the Library screen
   - Enter the manga site URL
   - Tap "Save" to add to your library

2. **Read Manga:**
   - Tap on any manga cover in the library
   - Select a chapter from the dropdown
   - Use "Previous" and "Next" buttons to navigate pages

## Backend Requirements

The app expects a Node.js backend server with these endpoints:

- `POST /scrape` - Scrapes manga metadata (name, cover URL)
  - Body: `{ mangaUrl: string }`
  - Returns: `{ name: string, coverUrl: string }`

- `GET /chapters` - Gets available chapters
  - Returns: `{ success: boolean, chapters: [{name: string, url: string}] }`

- `GET /scrape-image` - Gets manga page image
  - Query: `chapter` (string), `page` (number)
  - Returns: `{ success: boolean, image: string }`

## Troubleshooting

### Node Engine Warnings
The warnings about unsupported Node engine version (>= 20.19.4 required, you have 20.15.0) are non-critical. The app should work fine with Node 20.15.0, but you can upgrade Node.js if needed.

### Metro Bundler Issues
If you encounter bundler issues, try:
```bash
npm start -- --reset-cache
```

### Android Build Errors
Clean and rebuild:
```bash
cd android
./gradlew clean
cd ..
npx react-native run-android
```

### File Permission Issues
On Android 11+ devices, you may need to request runtime permissions for file access. Consider implementing runtime permission requests.

## Notes

- The app uses `ExternalDirectoryPath` for storing library data
- Images are cached by `react-native-fast-image` for better performance
- Server communication assumes the backend is on the same network
- Update the server URL in both `Library.tsx` and `MangaReader.tsx` as needed

## License

Private project - All rights reserved
