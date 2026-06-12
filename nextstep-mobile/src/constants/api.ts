// API base URL for the NextStep backend.
//
// Physical device with Expo Go:
// - Use the IP address of the COMPUTER running the backend.
// - The phone/tablet and computer must be on the same network.
// - Test from the phone browser first:
//   http://192.168.40.75:3001/health
//
// Android Emulator:
//   http://10.0.2.2:3001/api
//
// iOS Simulator:
//   http://localhost:3001/api

// Physical device or another computer on the same network:
//   http://10.0.0.72:3001/api

// In production (Vercel), use the Vercel deployment URL.
// The backend lives alongside the frontend, so we use a relative path.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '/api'
