// app/(admin)/attendances/_layout.tsx
import React from 'react';
import { Stack } from 'expo-router';

export default function AttendanceStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="form" options={{ headerShown: false }} />
    </Stack>
  );
}
