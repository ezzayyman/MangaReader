import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image, Platform, Alert } from 'react-native';
import RNFS from 'react-native-fs';
import { DOWNLOADS_MANIFEST_PATH, DOWNLOADS_ROOT, safeParseJSON, safeName } from './utils';

interface DownloadedChapter {
  url: string;
  title: string;
  isWebtoon: boolean;
  pages: string[];
}

interface DownloadedManga {
  mangaUrl: string;
  title: string;
  coverImageLocal?: string;
  author?: string;
  status?: string;
  genres?: string[];
  chapters: DownloadedChapter[];
}

const Downloads = ({ navigation }: any) => {
  const manifestPath = DOWNLOADS_MANIFEST_PATH;
  const downloadsRoot = DOWNLOADS_ROOT;
  const [downloads, setDownloads] = useState<DownloadedManga[]>([]);

  const loadSavedImages = async () => {
    try {
      const fileExists = await RNFS.exists(manifestPath);
      if (!fileExists) {
        setDownloads([]);
        return;
      }
      const fileContent = await RNFS.readFile(manifestPath, 'utf8');
      const parsed = safeParseJSON(fileContent);
      setDownloads(Array.isArray(parsed) ? parsed : []);
    } catch (error) {
      console.error('Error loading downloads:', error);
      setDownloads([]);
    }
  };

  const deleteDownload = async (mangaUrl: string) => {
    try {
      const fileExists = await RNFS.exists(manifestPath);
      const manifestRaw = fileExists ? await RNFS.readFile(manifestPath, 'utf8') : '[]';
      const parsed = safeParseJSON(manifestRaw);
      const filtered = Array.isArray(parsed) ? parsed.filter((m: any) => m.mangaUrl !== mangaUrl) : [];
      await RNFS.writeFile(manifestPath, JSON.stringify(filtered, null, 2), 'utf8');

      const mangaDir = `${downloadsRoot}/${safeName(mangaUrl)}`;
      const dirExists = await RNFS.exists(mangaDir);
      if (dirExists) {
        await RNFS.unlink(mangaDir);
      }

      setDownloads(filtered);
    } catch (error) {
      console.error('Error deleting download:', error);
      Alert.alert('Delete failed', 'Could not delete this download.');
    }
  };

  const confirmDelete = (mangaUrl: string, title: string) => {
    Alert.alert(
      'Delete download',
      `Remove "${title}" and its offline files?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteDownload(mangaUrl) },
      ]
    );
  };

  useEffect(() => {
    loadSavedImages();
  }, []);

  // Refresh downloads on focus (e.g., after a new download completes)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadSavedImages();
    });
    return unsubscribe;
  }, [navigation]);

  const renderItem = ({ item }: { item: DownloadedManga }) => (
    <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('OfflineReader', { mangaUrl: item.mangaUrl, title: item.title })}>
      <TouchableOpacity style={styles.deleteBadge} onPress={() => confirmDelete(item.mangaUrl, item.title)}>
        <Text style={styles.deleteBadgeText}>Delete</Text>
      </TouchableOpacity>
      {item.coverImageLocal ? (
        <Image
          source={{ uri: Platform.OS === 'android' ? encodeURI(item.coverImageLocal.startsWith('file://') ? item.coverImageLocal : `file://${item.coverImageLocal}`) : item.coverImageLocal.startsWith('file://') ? item.coverImageLocal : `file://${item.coverImageLocal}` }}
          style={styles.coverImage}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.coverPlaceholder} />
      )}
      <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.subtitle}>{item.chapters?.length || 0} chapters offline</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Offline mode - Downloads</Text>
      <Text style={styles.description}>Tap a title to read downloaded chapters offline.</Text>
      <FlatList
        data={downloads}
        keyExtractor={(item) => item.mangaUrl}
        renderItem={renderItem}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: 'space-between' }}
        contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 80, paddingTop: 12 }}
        ListEmptyComponent={<Text style={styles.empty}>No downloads available.</Text>}
      />
    </View>
  );
};

const CARD_MARGIN = 10;
const CARD_WIDTH = (require('react-native').Dimensions.get('window').width - CARD_MARGIN * 3) / 2;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1c1c1c',
  },
  header: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  description: {
    color: '#aaa',
    fontSize: 13,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.2,
    margin: CARD_MARGIN / 2,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 12,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  coverImage: {
    height: CARD_WIDTH * 0.65,
    borderRadius: 10,
    marginBottom: 10,
  },
  coverPlaceholder: {
    height: CARD_WIDTH * 0.65,
    borderRadius: 10,
    backgroundColor: '#3a3a3a',
    marginBottom: 10,
  },
  title: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  subtitle: {
    color: '#8aa1c8',
    fontSize: 12,
  },
  deleteBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255, 71, 87, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    zIndex: 2,
  },
  deleteBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  empty: {
    color: '#888',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
  },
});

export default Downloads;
