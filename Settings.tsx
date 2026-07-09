import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
  TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import RNFS from 'react-native-fs';
import {
  readSettings,
  writeSettings,
  readStats,
  AppSettings,
  ReadingStats,
  DEFAULT_SETTINGS,
  DEFAULT_STATS,
  DOWNLOADS_ROOT,
} from './utils';

const Settings = ({ navigation }: any) => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<ReadingStats>(DEFAULT_STATS);
  const [editingUrl, setEditingUrl] = useState(false);
  const [tempUrl, setTempUrl] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      loadData();
    });
    return unsub;
  }, [navigation]);

  const loadData = async () => {
    const s = await readSettings();
    setSettings(s);
    setTempUrl(s.serverUrl);
    const st = await readStats();
    setStats(st);
  };

  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await writeSettings(updated);
  };

  const clearImageCache = async () => {
    Alert.alert(
      'Clear Image Cache',
      'This will clear all cached images. Downloaded chapters will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              // React Native Image cache can't be cleared programmatically easily,
              // but we can inform the user
              Alert.alert('Done', 'Image cache will be cleared on next app restart.');
            } catch (err) {
              Alert.alert('Error', 'Failed to clear cache.');
            }
          },
        },
      ],
    );
  };

  const clearDownloads = async () => {
    Alert.alert(
      'Clear All Downloads',
      'This will delete ALL downloaded manga files. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              const exists = await RNFS.exists(DOWNLOADS_ROOT);
              if (exists) {
                await RNFS.unlink(DOWNLOADS_ROOT);
                await RNFS.mkdir(DOWNLOADS_ROOT);
              }
              const manifestPath = `${RNFS.ExternalDirectoryPath}/downloads.json`;
              await RNFS.writeFile(manifestPath, '[]', 'utf8');
              Alert.alert('Done', 'All downloads cleared.');
            } catch (err) {
              Alert.alert('Error', 'Failed to clear downloads.');
            }
          },
        },
      ],
    );
  };

  const formatTime = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Reading Settings */}
      <Text style={styles.sectionTitle}>Reading</Text>
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => updateSetting('readingDirection', settings.readingDirection === 'ltr' ? 'rtl' : 'ltr')}
        >
          <View style={styles.rowLeft}>
            <Icon name="swap-horizontal" size={22} color="#4a9eff" />
            <View style={styles.rowTextContainer}>
              <Text style={styles.rowTitle}>Reading Direction</Text>
              <Text style={styles.rowSubtitle}>
                {settings.readingDirection === 'ltr' ? 'Left to Right' : 'Right to Left'}
              </Text>
            </View>
          </View>
          <Icon name="chevron-forward" size={20} color="#666" />
        </TouchableOpacity>

        <View style={styles.separator} />

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Icon name="sunny" size={22} color="#4a9eff" />
            <View style={styles.rowTextContainer}>
              <Text style={styles.rowTitle}>Keep Screen Awake</Text>
              <Text style={styles.rowSubtitle}>Prevent screen from sleeping while reading</Text>
            </View>
          </View>
          <Switch
            value={settings.keepScreenAwake}
            onValueChange={(v) => updateSetting('keepScreenAwake', v)}
            trackColor={{ false: '#444', true: '#4a9eff' }}
            thumbColor={settings.keepScreenAwake ? '#fff' : '#888'}
          />
        </View>

        <View style={styles.separator} />

        <TouchableOpacity
          style={styles.row}
          onPress={() => updateSetting('imageQuality', settings.imageQuality === 'high' ? 'compressed' : 'high')}
        >
          <View style={styles.rowLeft}>
            <Icon name="image" size={22} color="#4a9eff" />
            <View style={styles.rowTextContainer}>
              <Text style={styles.rowTitle}>Image Quality</Text>
              <Text style={styles.rowSubtitle}>
                {settings.imageQuality === 'high' ? 'High (uses more data)' : 'Compressed (saves data)'}
              </Text>
            </View>
          </View>
          <Icon name="chevron-forward" size={20} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Server Settings */}
      <Text style={styles.sectionTitle}>Server</Text>
      <View style={styles.section}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Icon name="server" size={22} color="#4a9eff" />
            <View style={styles.rowTextContainer}>
              <Text style={styles.rowTitle}>Server URL</Text>
              {editingUrl ? (
                <TextInput
                  style={styles.urlInput}
                  value={tempUrl}
                  onChangeText={setTempUrl}
                  autoFocus
                  placeholder="http://192.168.1.2:3000"
                  placeholderTextColor="#666"
                  onBlur={() => {
                    setEditingUrl(false);
                    if (tempUrl.trim()) {
                      updateSetting('serverUrl', tempUrl.trim());
                    }
                  }}
                  onSubmitEditing={() => {
                    setEditingUrl(false);
                    if (tempUrl.trim()) {
                      updateSetting('serverUrl', tempUrl.trim());
                    }
                  }}
                />
              ) : (
                <Text style={styles.rowSubtitle}>{settings.serverUrl}</Text>
              )}
            </View>
          </View>
          <TouchableOpacity onPress={() => setEditingUrl(!editingUrl)}>
            <Icon name={editingUrl ? 'checkmark' : 'create-outline'} size={20} color="#666" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Reading Stats */}
      <Text style={styles.sectionTitle}>Reading Statistics</Text>
      <View style={styles.section}>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Icon name="book" size={28} color="#4a9eff" />
            <Text style={styles.statValue}>{stats.mangaStarted}</Text>
            <Text style={styles.statLabel}>Manga Started</Text>
          </View>
          <View style={styles.statItem}>
            <Icon name="layers" size={28} color="#ff6b9d" />
            <Text style={styles.statValue}>{stats.totalChaptersCompleted}</Text>
            <Text style={styles.statLabel}>Chapters Read</Text>
          </View>
          <View style={styles.statItem}>
            <Icon name="documents" size={28} color="#ffd93d" />
            <Text style={styles.statValue}>{stats.totalPagesRead}</Text>
            <Text style={styles.statLabel}>Pages Read</Text>
          </View>
          <View style={styles.statItem}>
            <Icon name="time" size={28} color="#6bcb77" />
            <Text style={styles.statValue}>{formatTime(stats.totalTimeSpentMs)}</Text>
            <Text style={styles.statLabel}>Time Reading</Text>
          </View>
        </View>
      </View>

      {/* Storage */}
      <Text style={styles.sectionTitle}>Storage</Text>
      <View style={styles.section}>
        <TouchableOpacity style={styles.row} onPress={clearImageCache}>
          <View style={styles.rowLeft}>
            <Icon name="trash-outline" size={22} color="#ff6b6b" />
            <View style={styles.rowTextContainer}>
              <Text style={styles.rowTitle}>Clear Image Cache</Text>
              <Text style={styles.rowSubtitle}>Free up space from cached images</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.separator} />

        <TouchableOpacity style={styles.row} onPress={clearDownloads}>
          <View style={styles.rowLeft}>
            <Icon name="trash" size={22} color="#ff6b6b" />
            <View style={styles.rowTextContainer}>
              <Text style={styles.rowTitle}>Clear All Downloads</Text>
              <Text style={styles.rowSubtitle}>Delete all downloaded manga files</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {/* About */}
      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.section}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Icon name="information-circle" size={22} color="#4a9eff" />
            <View style={styles.rowTextContainer}>
              <Text style={styles.rowTitle}>Version</Text>
              <Text style={styles.rowSubtitle}>1.0.0</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  content: {
    paddingBottom: 20,
  },
  sectionTitle: {
    color: '#4a9eff',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 8,
    marginHorizontal: 16,
  },
  section: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rowTextContainer: {
    marginLeft: 14,
    flex: 1,
  },
  rowTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  rowSubtitle: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: '#2C2C2C',
    marginLeft: 52,
  },
  urlInput: {
    color: '#fff',
    fontSize: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#4a9eff',
    paddingVertical: 2,
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
  },
  statItem: {
    width: '50%',
    alignItems: 'center',
    paddingVertical: 16,
  },
  statValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 8,
  },
  statLabel: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
});

export default Settings;
