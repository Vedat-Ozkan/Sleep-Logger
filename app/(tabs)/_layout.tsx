import { colors } from "@/src/theme/colors";
import { MaterialIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgSecondary,
          borderTopColor: colors.borderSecondary,
        },
        tabBarActiveTintColor: colors.accentMint,
        tabBarInactiveTintColor: colors.textSecondary,
      }}
    >
      <Tabs.Screen
        name="log"
        options={{
          title: "Log",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="more-time" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="timeline"
        options={{
          title: "Timeline",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name="insert-chart-outlined"
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="reminders"
        options={{
          title: "Reminders",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name="notifications-active"
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="settings" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
