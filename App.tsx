import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import NetInfo from '@react-native-community/netinfo';
import Library from './Library';
import Search from './Search';
import ChapterList from './ChapterList';
import MangaReader from './MangaReader';
import Downloads from './Downloads';
import OfflineReader from './OfflineReader';
import Settings from './Settings';

const Stack = createStackNavigator();
const navigationRef = createNavigationContainerRef();

export default function App() {
  const [initialRoute, setInitialRoute] = useState<string | null>(null);
  const [navReady, setNavReady] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    const resolveInitialRoute = async () => {
      try {
        const state = await NetInfo.fetch();
        if (mounted) {
          const online = !!state.isConnected;
          setIsOnline(online);
          setInitialRoute(online ? 'Library' : 'Downloads');
        }
      } catch (err) {
        console.warn('NetInfo fetch failed, defaulting to Library', err);
        if (mounted) {
          setIsOnline(true);
          setInitialRoute('Library');
        }
      }
    };

    resolveInitialRoute();

    const unsubscribe = NetInfo.addEventListener(state => {
      const online = !!state.isConnected;
      setIsOnline(online);
      setInitialRoute(prev => prev ?? (online ? 'Library' : 'Downloads'));
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!navReady) return;
    const unsub = NetInfo.addEventListener(state => {
      if (!navigationRef.isReady()) return;
      const online = !!state.isConnected;
      setIsOnline(online);
      const current = navigationRef.getCurrentRoute()?.name;
      if (!online && current !== 'Downloads') {
        navigationRef.reset({ index: 0, routes: [{ name: 'Downloads' }] });
      } else if (online && current === 'Downloads') {
        navigationRef.reset({ index: 0, routes: [{ name: 'Library' }] });
      }
    });
    return () => unsub();
  }, [navReady]);

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1c1c' }}>
        <ActivityIndicator color="#4a9eff" size="large" />
        <Text style={{ color: '#fff', marginTop: 10 }}>Loading...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => setNavReady(true)}
    >
      <Stack.Navigator 
        initialRouteName={initialRoute}
        screenOptions={{
          headerStyle: {
            backgroundColor: '#121212', // Dark grey to match the app background
          },
          headerTintColor: '#fff', // White text for back button and title
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen 
          name="Library" 
          component={Library}
          options={({ navigation }: any) => ({
            title: 'My Library',
            headerRight: () => (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={() => navigation.navigate('Search')}
                  style={{ marginRight: 10, padding: 5 }}
                >
                  <Icon name="search" size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => navigation.navigate('Settings')}
                  style={{ marginRight: 15, padding: 5 }}
                >
                  <Icon name="settings-outline" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            ),
          })}
        />
        <Stack.Screen name="Search" component={Search} options={{ title: 'Search Manga' }} />
        <Stack.Screen name="Settings" component={Settings} options={{ title: 'Settings' }} />
        <Stack.Screen name="Downloads" component={Downloads} options={{ title: 'Downloads' }} />
        <Stack.Screen name="OfflineReader" component={OfflineReader} options={{ title: 'Offline Reader' }} />
        <Stack.Screen name="ChapterList" component={ChapterList} options={{ title: 'Select Chapter' }} />
        <Stack.Screen 
          name="MangaReader" 
          component={MangaReader}
          options={({ route }: any) => ({ 
            headerTitleAlign: 'left',
            headerTitle: () => (
              <View style={{ alignItems: 'flex-start' }}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
                  {route.params?.mangaName || 'MangaReader'}
                </Text>
                <Text style={{ color: '#aaa', fontSize: 12, marginTop: 2 }}>
                  {route.params?.currentChapterName || ''}
                </Text>
              </View>
            ),
            headerRight: () => (
              <View style={{ marginRight: 15 }}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>
                  {route.params?.currentPage || 1} / {route.params?.totalPages || '?'}
                </Text>
              </View>
            )
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
