module.exports = {
  // Bundled serifs matching the web theme (Fraunces display, Spectral body).
  // `npx react-native-asset` copies these into the Xcode project and adds them
  // to the Info.plist UIAppFonts list so matchFont can resolve them on tvOS.
  project: {
    ios: {},
  },
  assets: ["./assets/fonts"],
};
