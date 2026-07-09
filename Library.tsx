import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Dimensions } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Svg, { Circle, G } from 'react-native-svg';
import LinearGradient from 'react-native-linear-gradient';
import axios from 'axios';

import RNFS from 'react-native-fs';
import downloadManager, { DownloadState } from './downloadManager';
import { SERVER_URL, COLORS } from './config';
import {
  getProxiedImageUrl,
  safeParseJSON,
  DATA_PATH,
  FAVORITES_PATH,
  HISTORY_PATH,
  readHistory,
  readFavorites,
  readStats,
} from './utils';


const { width } = Dimensions.get('window');
const CARD_MARGIN = 10;
const CARD_WIDTH = (width - CARD_MARGIN * 3) / 2;
const filePath = DATA_PATH;

interface SavedImage {
  id: string;
  url: string;
  caption: string;
  mangaUrl: string; // ADD THIS - Store the actual manga page URL
  proxiedUrl?: string;
}

interface FavoriteItem {
  mangaUrl: string;
  title: string;
  coverImage: string;
}

interface HistoryItem {
  mangaUrl: string;
  title: string;
  coverImage: string;
  lastChapterUrl: string;
  lastChapterTitle: string;
  timestamp: number;
  progress?: number;
}

const Library = ({ navigation }: any) => {
  const [savedImages, setSavedImages] = useState<SavedImage[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'library' | 'favorites' | 'history'>('library');
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const computingProgressRef = useRef<Set<string>>(new Set());
  const [downloadState, setDownloadState] = useState<DownloadState>({ active: false, progress: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [favUpdates, setFavUpdates] = useState<Record<string, string>>({});

  useEffect(() => {
    loadSavedImages();
    loadFavorites();
  }, []);

  useEffect(() => {
    const unsub = downloadManager.subscribe(setDownloadState);
    return () => { unsub(); };
  }, []);

  const safeParseJSONLocal = (jsonString: string): any => {
    return safeParseJSON(jsonString);
  };

  const loadSavedImages = async () => {
    try {
      const fileExists = await RNFS.exists(filePath);
      if (fileExists) {
        const fileContent = await RNFS.readFile(filePath, 'utf8');
        const parsed = safeParseJSONLocal(fileContent);
        setSavedImages(Array.isArray(parsed) ? parsed : []);
      } else {
        setSavedImages([]);
      }
    } catch (error) {
      console.error('Error loading images:', error);
      setSavedImages([]);
    }
  };

  const loadFavorites = async () => {
    try {
      const favs = await readFavorites();
      setFavorites(favs);
    } catch (error) {
      console.error('Error loading favorites:', error);
      setFavorites([]);
    }
  };

  const loadHistory = async () => {
    try {
      const hist = await readHistory();
      const sorted = [...hist].sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
      setHistory(sorted);
    } catch (error) {
      console.error('Error loading history:', error);
      setHistory([]);
    }
  };

  // Check for new chapters on favorites
  const checkFavoriteUpdates = async () => {
    const updates: Record<string, string> = {};
    for (const fav of favorites) {
      try {
        const resp = await axios.get(`${SERVER_URL}/chapters`, { params: { mangaUrl: fav.mangaUrl }, timeout: 10000 });
        if (resp.data?.success && Array.isArray(resp.data.chapters) && resp.data.chapters.length > 0) {
          const latestChapter = resp.data.chapters[0];
          // Check if reading history has this chapter
          const histItem = history.find(h => h.mangaUrl === fav.mangaUrl);
          if (histItem && histItem.lastChapterUrl !== latestChapter.url) {
            updates[fav.mangaUrl] = latestChapter.title;
          } else if (!histItem) {
            updates[fav.mangaUrl] = latestChapter.title;
          }
        }
      } catch (e) {
        // skip on error
      }
    }
    setFavUpdates(updates);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadSavedImages(), loadFavorites(), loadHistory()]);
      if (activeTab === 'favorites') {
        await checkFavoriteUpdates();
      }
    } finally {
      setRefreshing(false);
    }
  };

  // Reload library when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadSavedImages();
      loadFavorites();
      loadHistory();
    });
    return unsubscribe;
  }, [navigation]);

  // Reload favorites when switching to favorites tab
  useEffect(() => {
    if (activeTab === 'favorites') {
      loadFavorites();
    } else if (activeTab === 'history') {
      loadHistory();
    }
    if (activeTab !== 'library') {
      setSelectionMode(false);
      setSelectedIds([]);
    }
  }, [activeTab]);

  // Compute progress for items missing it in history (on demand, once per manga)
  useEffect(() => {
    const computeMissingProgress = async () => {
      for (const item of history) {
        const hasProgress = typeof item.progress === 'number';
        const cachedProgress = progressMap[item.mangaUrl];
        if (hasProgress || typeof cachedProgress === 'number') continue;
        if (computingProgressRef.current.has(item.mangaUrl)) continue;
        computingProgressRef.current.add(item.mangaUrl);
        try {
          const resp = await axios.get(`${SERVER_URL}/chapters`, { params: { mangaUrl: item.mangaUrl } });
          if (resp.data?.success && Array.isArray(resp.data.chapters) && resp.data.chapters.length > 0) {
            const chapters: { url: string; title: string }[] = resp.data.chapters;
            const total = chapters.length;
            const idx = chapters.findIndex(ch => ch.url === item.lastChapterUrl);
            const completion = idx !== -1 ? Math.round(((total - idx) / total) * 100) : 0;
            setProgressMap(prev => ({ ...prev, [item.mangaUrl]: Math.min(100, Math.max(0, completion)) }));
          } else {
            setProgressMap(prev => ({ ...prev, [item.mangaUrl]: 0 }));
          }
        } catch (err) {
          console.error('Error computing progress for', item.mangaUrl, err);
          setProgressMap(prev => ({ ...prev, [item.mangaUrl]: 0 }));
        } finally {
          computingProgressRef.current.delete(item.mangaUrl);
        }
      }
    };
    computeMissingProgress();
  }, [history, progressMap]);

  const progressLookup = useMemo(() => {
    const map: Record<string, number> = { ...progressMap };
    history.forEach(item => {
      if (typeof item.progress === 'number') {
        map[item.mangaUrl] = item.progress;
      }
      if (map[item.mangaUrl] === undefined) {
        map[item.mangaUrl] = 0; // default 0% when still computing
      }
    });
    return map;
  }, [history, progressMap]);

  const listExtraKey = useMemo(
    () => `${selectionMode ? '1' : '0'}|${selectedIds.join(',')}|${history.length}|${Object.keys(progressLookup).length}`,
    [selectionMode, selectedIds, history.length, progressLookup]
  );

  const handleMangaPress = (item: SavedImage) => {
    navigation.navigate('ChapterList', { 
      mangaUrl: item.mangaUrl,
      mangaName: item.caption 
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const updatedImages = savedImages.filter(item => !selectedIds.includes(item.id));
    setSavedImages(updatedImages);
    try {
      await RNFS.writeFile(filePath, JSON.stringify(updatedImages, null, 2), 'utf8');
    } catch (error) {
      console.error('Error deleting manga:', error);
    }
    setSelectedIds([]);
    setSelectionMode(false);
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const renderCard = ({ item }: { item: SavedImage }) => {
    const imageUrl = item.url ? getProxiedImageUrl(item.url) : (item.proxiedUrl || '');
    const isSelected = selectedIds.includes(item.id);
    const progress = progressLookup[item.mangaUrl];
    const displayProgress = typeof progress === 'number' ? `${progress}%` : undefined;
    const handlePress = () => {
      if (selectionMode) {
        toggleSelect(item.id);
        return;
      }
      handleMangaPress(item);
    };
    const handleLongPress = () => {
      if (!selectionMode) {
        setSelectionMode(true);
      }
      toggleSelect(item.id);
    };

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handlePress}
        onLongPress={handleLongPress}
        style={[styles.card, isSelected && styles.cardSelected]}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]} />
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.45)', COLORS.overlayHeavy]}
          locations={[0, 0.5, 1]}
          style={styles.textOverlay}
        >
          <Text style={styles.caption} numberOfLines={1}>{item.caption}</Text>
        </LinearGradient>
        <View style={styles.progressWrapper}>
          <Svg width={36} height={36} viewBox="0 0 40 40">
            <G rotation="-90" origin="20,20">
              <Circle cx="20" cy="20" r="16" stroke={COLORS.border} strokeWidth="3" fill="none" />
              <Circle
                cx="20"
                cy="20"
                r="16"
                stroke={COLORS.accent}
                strokeWidth="3"
                strokeDasharray={`${((displayProgress ? parseInt(displayProgress) : 0) / 100) * 2 * Math.PI * 16} ${2 * Math.PI * 16}`}
                strokeLinecap="round"
                fill="none"
              />
            </G>
          </Svg>
          <Text style={styles.progressText}>{displayProgress || '0%'}</Text>
        </View>
        {selectionMode && (
          <View style={styles.selectionBadge}>
            <Icon
              name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={isSelected ? COLORS.accent : '#bbb'}
            />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderFavorite = ({ item }: { item: FavoriteItem }) => {
    const imageUrl = getProxiedImageUrl(item.coverImage);
    const progress = progressLookup[item.mangaUrl];
    const displayProgress = typeof progress === 'number' ? `${progress}%` : undefined;
    const hasUpdate = !!favUpdates[item.mangaUrl];
    return (
      <View style={styles.card}>
        <TouchableOpacity onPress={() => navigation.navigate('ChapterList', { mangaUrl: item.mangaUrl, mangaName: item.title })} style={{ flex: 1 }}>
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.45)', COLORS.overlayHeavy]}
            locations={[0, 0.5, 1]}
            style={styles.textOverlay}
          >
            <Text style={styles.caption}>{item.title}</Text>
          </LinearGradient>
          {hasUpdate && (
            <View style={styles.updateBadge}>
              <Text style={styles.updateBadgeText}>NEW</Text>
            </View>
          )}
          <View style={styles.progressWrapper}>
            <Svg width={36} height={36} viewBox="0 0 40 40">
              <G rotation="-90" origin="20,20">
                <Circle cx="20" cy="20" r="16" stroke={COLORS.border} strokeWidth="3" fill="none" />
                <Circle
                  cx="20"
                  cy="20"
                  r="16"
                  stroke={COLORS.accent}
                  strokeWidth="3"
                  strokeDasharray={`${(displayProgress ? parseInt(displayProgress) : 0) / 100 * 2 * Math.PI * 16} ${2 * Math.PI * 16}`}
                  strokeLinecap="round"
                  fill="none"
                />
              </G>
            </Svg>
            <Text style={styles.progressText}>{displayProgress || '0%'}</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const renderHistoryItem = ({ item }: { item: HistoryItem }) => {
    const imageUrl = getProxiedImageUrl(item.coverImage);
    return (
      <TouchableOpacity
        style={styles.historyCard}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('MangaReader', {
          mangaUrl: item.mangaUrl,
          mangaName: item.title,
          selectedChapter: item.lastChapterUrl,
          currentChapterName: item.lastChapterTitle,
          coverImage: item.coverImage,
          genres: [],
        })}
      >
        <Image
          source={{ uri: imageUrl }}
          style={styles.historyImage}
          resizeMode="cover"
        />
        <View style={styles.historyInfo}>
          <Text style={styles.historyTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.historySubtitle} numberOfLines={1}>{item.lastChapterTitle}</Text>
          <View style={styles.continuePill}>
            <Icon name="play" size={11} color={COLORS.accent} />
            <Text style={styles.historyContinue}>Continue</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {selectionMode && activeTab === 'library' && (
        <View style={styles.selectionBar}>
          <TouchableOpacity onPress={exitSelection} style={styles.selectionBarButton}>
            <Icon name="close" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.selectionBarText}>{selectedIds.length} selected</Text>
          <TouchableOpacity onPress={deleteSelected} style={styles.selectionBarButton}>
            <Icon name="trash" size={20} color="#ff6b6b" />
          </TouchableOpacity>
        </View>
      )}

      {downloadState.active && (
        <View style={styles.downloadBar}>
          <View style={[styles.downloadBarFill, { width: `${downloadState.progress || 0}%` }]} />
          <View style={styles.downloadBarContent}>
            <Text style={styles.downloadBarText} numberOfLines={1}>
              {downloadState.title || 'Downloading...'}
            </Text>
            <Text style={styles.downloadBarSub}>
              {Math.round(downloadState.progress || 0)}% {downloadState.message ? `• ${downloadState.message}` : ''}
            </Text>
          </View>
        </View>
      )}

      {activeTab === 'library' && (
        <FlatList
          data={savedImages}
          keyExtractor={(item) => item.id}
          numColumns={2}
          extraData={listExtraKey}
          removeClippedSubviews={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4a9eff" colors={['#4a9eff']} />
          }
          contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 70, paddingTop: selectionMode ? 64 : 12 }}
          columnWrapperStyle={{ justifyContent: 'space-between' }}
          renderItem={renderCard}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Icon name="library-outline" size={52} color={COLORS.border} />
              <Text style={styles.emptyStateText}>No saved manga yet</Text>
              <Text style={styles.emptyStateHint}>Search for manga to add to your library</Text>
            </View>
          }
        />
      )}
      
      {activeTab === 'favorites' && (
        <FlatList
          data={favorites}
          keyExtractor={(item, index) => `${item.mangaUrl}-${index}`}
          numColumns={2}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} colors={[COLORS.accent]} />
          }
          contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 70, paddingTop: 12 }}
          columnWrapperStyle={{ justifyContent: 'space-between' }}
          renderItem={renderFavorite}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Icon name="heart-outline" size={52} color={COLORS.border} />
              <Text style={styles.emptyStateText}>No favorites yet</Text>
              <Text style={styles.emptyStateHint}>Tap the heart icon on a manga to save it here</Text>
            </View>
          }
        />
      )}
      
      {activeTab === 'history' && (
        <FlatList
          data={history}
          keyExtractor={(item) => item.mangaUrl}
          renderItem={renderHistoryItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} colors={[COLORS.accent]} />
          }
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 80, paddingTop: 12 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Icon name="time-outline" size={52} color={COLORS.border} />
              <Text style={styles.emptyStateText}>No history yet</Text>
              <Text style={styles.emptyStateHint}>Start reading to see your history here</Text>
            </View>
          }
        />
      )}
      
      {/* Bottom Navigation Bar */}
      <LinearGradient
        colors={['rgba(16,16,16,0.92)', 'rgba(12,12,12,0.98)']}
        style={styles.bottomBar}
      >
        {(['library', 'favorites', 'history'] as const).map((tab) => {
          const isActive = activeTab === tab;
          const iconName = tab === 'library' ? 'library' : tab === 'favorites' ? 'heart' : 'time';
          const label = tab.charAt(0).toUpperCase() + tab.slice(1);
          return (
            <TouchableOpacity
              key={tab}
              style={styles.tabButton}
              onPress={() => setActiveTab(tab)}
            >
              <Icon name={iconName} size={24} color={isActive ? COLORS.accent : COLORS.textTertiary} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{label}</Text>
              {isActive && <View style={styles.tabDot} />}
            </TouchableOpacity>
          );
        })}
      </LinearGradient>
    </View>
  );
};



const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 2,
    margin: CARD_MARGIN / 2,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 8,
    position: 'relative',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    backgroundColor: COLORS.border,
  },
  textOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 40,
    paddingBottom: 10,
    paddingHorizontal: 10,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  caption: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  text: {
    color: COLORS.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyStateText: {
    color: COLORS.textSecondary,
    fontSize: 17,
    fontWeight: '600',
    marginTop: 16,
    letterSpacing: 0.2,
  },
  emptyStateHint: {
    color: COLORS.textTertiary,
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 64,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.06)',
    elevation: 12,
  },
  tabButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
  },
  tabText: {
    color: COLORS.textTertiary,
    fontSize: 11,
    marginTop: 3,
    letterSpacing: 0.3,
  },
  tabTextActive: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  tabDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
    marginTop: 3,
  },
  historyCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  historyImage: {
    width: 100,
    height: 135,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  historyInfo: {
    flex: 1,
    padding: 14,
    justifyContent: 'center',
  },
  historyTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 5,
    letterSpacing: 0.2,
  },
  historySubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginBottom: 10,
  },
  continuePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  historyContinue: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  progressWrapper: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(10,10,10,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.accentGlow,
  },
  progressText: {
    position: 'absolute',
    color: COLORS.textPrimary,
    fontSize: 9,
    fontWeight: 'bold',
  },
  selectionBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    padding: 2,
  },
  selectionBar: {
    height: 50,
    backgroundColor: COLORS.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  selectionBarButton: {
    padding: 6,
  },
  selectionBarText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  downloadBar: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: '#1a2636',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.accentGlow,
  },
  downloadBarFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: COLORS.accent,
    opacity: 0.2,
  },
  downloadBarContent: {
    padding: 12,
  },
  downloadBarText: {
    color: COLORS.textPrimary,
    fontWeight: 'bold',
    fontSize: 14,
  },
  downloadBarSub: {
    color: '#8ab4f0',
    marginTop: 3,
    fontSize: 12,
  },
  updateBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  updateBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
});

export default Library;
