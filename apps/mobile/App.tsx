import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

import DashboardScreen from "./screens/DashboardScreen";
import ChatScreen from "./screens/ChatScreen";
import MeshScreen from "./screens/MeshScreen";
import PromptLibraryScreen from "./screens/PromptLibraryScreen";
import AuditScreen from "./screens/AuditScreen";
import HistoryScreen from "./screens/HistoryScreen";
import BatchScreen from "./screens/BatchScreen";
import PlaygroundScreen from "./screens/PlaygroundScreen";
import SettingsScreen from "./screens/SettingsScreen";

// ── navigation ────────────────────────────────────────────────────────────────

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_BAR_BG = "#18181b";
const TAB_ACTIVE = "#10b981";
const TAB_INACTIVE = "#52525b";
const HEADER_BG = "#09090b";
const HEADER_TEXT = "#fafafa";
const BORDER_COLOR = "#27272a";

// Tab icon component using emoji (no native icon deps required)
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.55, marginBottom: -4 }}>{emoji}</Text>
  );
}

// The "More" stack holds Mesh, History, Batch, Playground, Settings
function MoreStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: HEADER_BG },
        headerTintColor: HEADER_TEXT,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: "#09090b" },
      }}
    >
      <Stack.Screen name="MoreHome" component={MoreHomeScreen} options={{ title: "More" }} />
      <Stack.Screen name="Mesh" component={MeshScreen} options={{ title: "Mesh Cluster" }} />
      <Stack.Screen name="History" component={HistoryScreen} options={{ title: "History" }} />
      <Stack.Screen name="Batch" component={BatchScreen} options={{ title: "Batch & Schedule" }} />
      <Stack.Screen
        name="Playground"
        component={PlaygroundScreen}
        options={{ title: "Playground" }}
      />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
    </Stack.Navigator>
  );
}

// "More" home screen — grid of links
function MoreHomeScreen({ navigation }: any) {
  const items = [
    { screen: "Mesh", label: "Mesh Cluster", emoji: "📡", desc: "Provider health & latency" },
    { screen: "History", label: "History", emoji: "🔍", desc: "Search all conversations" },
    { screen: "Batch", label: "Batch & Schedule", emoji: "📅", desc: "Scheduled AI jobs" },
    { screen: "Playground", label: "Playground", emoji: "🧪", desc: "A/B model comparison" },
    { screen: "Settings", label: "Settings", emoji: "⚙️", desc: "Connection, keys & privacy" },
  ];
  return (
    <View style={sMore.container}>
      {items.map((item) => (
        <TouchableOpacity
          key={item.screen}
          style={sMore.item}
          onPress={() => navigation.navigate(item.screen)}
          activeOpacity={0.7}
        >
          <Text style={sMore.emoji}>{item.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={sMore.label}>{item.label}</Text>
            <Text style={sMore.desc}>{item.desc}</Text>
          </View>
          <Text style={sMore.arrow}>›</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const sMore = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b", padding: 16, gap: 10 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#18181b",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#27272a",
  },
  emoji: { fontSize: 24, width: 32, textAlign: "center" },
  label: { color: "#fafafa", fontSize: 15, fontWeight: "600", marginBottom: 2 },
  desc: { color: "#71717a", fontSize: 12 },
  arrow: { color: "#52525b", fontSize: 22, fontWeight: "300" },
});

// ── root app ───────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: HEADER_BG },
          headerTitleStyle: { color: HEADER_TEXT },
          headerShadowVisible: false,
          tabBarStyle: {
            backgroundColor: TAB_BAR_BG,
            borderTopColor: BORDER_COLOR,
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: TAB_ACTIVE,
          tabBarInactiveTintColor: TAB_INACTIVE,
          tabBarLabelStyle: { fontSize: 11, marginBottom: 2 },
        }}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{
            title: "Dashboard",
            tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Chat"
          component={ChatScreen}
          options={{
            headerShown: false,
            title: "Chat",
            tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Prompts"
          component={PromptLibraryScreen}
          options={{
            title: "Prompts",
            tabBarIcon: ({ focused }) => <TabIcon emoji="📚" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Audit"
          component={AuditScreen}
          options={{
            title: "Audit",
            tabBarIcon: ({ focused }) => <TabIcon emoji="💰" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="More"
          component={MoreStack}
          options={{
            headerShown: false,
            title: "More",
            tabBarIcon: ({ focused }) => <TabIcon emoji="☰" focused={focused} />,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
