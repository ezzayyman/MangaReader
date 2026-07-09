import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
  Modal,
  Alert,
  RefreshControl,
} from 'react-native';
import axios from 'axios';
import Icon from 'react-native-vector-icons/Ionicons';
import RNFS from 'react-native-fs';
import downloadManager from './downloadManager';
import { SERVER_URL } from './config';
import {
  readHistory as readHistoryUtil,
  writeHistory as writeHistoryUtil,
  readFavorites as readFavoritesUtil,
  writeFavorites as writeFavoritesUtil,
  getProxiedImageUrl,
  safeName,
  ensureDir,
  DOWNLOADS_MANIFEST_PATH,
  DOWNLOADS_ROOT,
  readStats,
  writeStats,
} from './utils';

type Chapter = {
  title: string;
  url: string;
};

type MangaDetails = {
  title: string;
  coverImage: string;
  author: string;
  status: string;
  genres: string[];
  description: string;
};

const ChapterList = ({ route, navigation }: any) => {
  const serverUrl = SERVER_URL;
  const { mangaUrl, mangaName } = route.params || {};
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [mangaDetails, setMangaDetails] = useState<MangaDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  const downloadsManifestPath = DOWNLOADS_MANIFEST_PATH;
  const downloadsRoot = DOWNLOADS_ROOT;

  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [lastReadChapter, setLastReadChapter] = useState<Chapter | null>(null);
  const [readChapterUrls, setReadChapterUrls] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchData();
    loadLastReadChapter();
    loadReadChapters();
  }, []);

  // Reload read status on focus (e.g., when coming back from MangaReader)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadLastReadChapter();
      loadReadChapters();
    });
    return unsubscribe;
  }, [navigation]);

  const fetchData = async () => {
    if (!mangaUrl) {
      console.error("No manga URL provided");
      setError("No manga URL provided");
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      
      // Fetch manga details and chapters in parallel
      const [detailsResponse, chaptersResponse] = await Promise.all([
        axios.get(`${serverUrl}/manga-details`, { params: { mangaUrl } }),
        axios.get(`${serverUrl}/chapters`, { params: { mangaUrl } }),
      ]);

      if (detailsResponse.data.success) {
        setMangaDetails({
          title: detailsResponse.data.title,
          coverImage: detailsResponse.data.coverImage,
          author: detailsResponse.data.author,
          status: detailsResponse.data.status,
          genres: detailsResponse.data.genres || [],
          description: detailsResponse.data.description,
        });

        // Check favorites after details are available
        checkIfFavorite(detailsResponse.data.title, mangaUrl);
      }

      if (chaptersResponse.data.success && chaptersResponse.data.chapters.length > 0) {
        setChapters(chaptersResponse.data.chapters);
      } else {
        setError("No chapters found.");
      }
    } catch (error) {
      console.error("Error fetching data from server:", error);
      setError("Failed to load data.");
    } finally {
      setLoading(false);
    }
  };

  const readFavorites = async (): Promise<any[]> => readFavoritesUtil();

  const writeFavorites = async (list: any[]) => writeFavoritesUtil(list);

  const readHistory = async (): Promise<any[]> => readHistoryUtil();

  const writeHistory = async (list: any[]) => writeHistoryUtil(list);

  const saveToHistory = async (chapter: Chapter) => {
    if (!mangaDetails || !mangaUrl) return;
    const total = chapters.length || 1;
    const idx = chapters.findIndex(c => c.url === chapter.url);
    const completion = idx !== -1 ? Math.round(((total - idx) / total) * 100) : 0;
    const list = await readHistory();
    const filtered = list.filter(item => item.mangaUrl !== mangaUrl);
    const updated = [
      {
        mangaUrl,
        title: mangaDetails.title,
        coverImage: mangaDetails.coverImage,
        lastChapterUrl: chapter.url,
        lastChapterTitle: chapter.title,
        timestamp: Date.now(),
        progress: Math.min(100, Math.max(0, completion)),
      },
      ...filtered,
    ];
    await writeHistory(updated);
  };

  const checkIfFavorite = async (title: string, url: string) => {
    const list = await readFavorites();
    const found = list.some(item => item.mangaUrl === url);
    setIsFavorite(found);
  };

  const loadLastReadChapter = async () => {
    if (!mangaUrl) return;
    const historyList = await readHistory();
    const historyItem = historyList.find((item: any) => item.mangaUrl === mangaUrl);
    if (historyItem && historyItem.lastChapterUrl) {
      setLastReadChapter({
        title: historyItem.lastChapterTitle || 'Continue Reading',
        url: historyItem.lastChapterUrl,
      });
    }
  };

  const loadReadChapters = async () => {
    if (!mangaUrl) return;
    const historyList = await readHistory();
    const historyItem = historyList.find((item: any) => item.mangaUrl === mangaUrl);
    if (historyItem && historyItem.lastChapterUrl) {
      // Mark the last read chapter and all chapters after it (already read) as read
      // chapters are in reverse order (newest first), so chapters AFTER lastReadChapter index are already read
      setReadChapterUrls(new Set([historyItem.lastChapterUrl]));
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchData();
      await loadLastReadChapter();
      await loadReadChapters();
    } finally {
      setRefreshing(false);
    }
  };

  const handleContinueReading = () => {
    if (lastReadChapter) {
      handleChapterPress(lastReadChapter);
    }
  };

  const toggleFavorite = async () => {
    if (!mangaDetails || !mangaUrl) return;
    const list = await readFavorites();
    const exists = list.findIndex(item => item.mangaUrl === mangaUrl);
    if (exists !== -1) {
      // Remove
      const updated = list.filter(item => item.mangaUrl !== mangaUrl);
      await writeFavorites(updated);
      setIsFavorite(false);
    } else {
      // Add
      const updated = [
        ...list,
        {
          mangaUrl,
          title: mangaDetails.title,
          coverImage: mangaDetails.coverImage,
        },
      ];
      await writeFavorites(updated);
      setIsFavorite(true);
    }
  };

  const readDownloadsManifest = async () => {
    try {
      const exists = await RNFS.exists(downloadsManifestPath);
      if (!exists) return [] as any[];
      const data = await RNFS.readFile(downloadsManifestPath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Failed to read downloads manifest:', err);
      return [] as any[];
    }
  };

  const writeDownloadsManifest = async (list: any[]) => {
    try {
      await RNFS.writeFile(downloadsManifestPath, JSON.stringify(list, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to write downloads manifest:', err);
    }
  };

  const downloadBinary = async (fromUrl: string, toFile: string) => {
    await ensureDir(toFile.substring(0, toFile.lastIndexOf('/')));
    await RNFS.downloadFile({ fromUrl, toFile }).promise;
    return toFile;
  };

  const downloadChapter = async (chapter: Chapter, index: number, total: number) => {
    if (!mangaUrl || !mangaDetails) return null;
    const mangaDir = `${downloadsRoot}/${safeName(mangaUrl)}`;
    const chapterDir = `${mangaDir}/${safeName(chapter.url)}`;
    await ensureDir(mangaDir);
    await ensureDir(chapterDir);

    downloadManager.update((index / total) * 100, `Preparing ${chapter.title}`);
    const infoResp = await axios.get(`${serverUrl}/chapter-info`, { params: { mangaUrl, chapter: chapter.url }, timeout: 20000 });
    const isWebtoon = !!infoResp.data?.isWebtoon;
    let images: string[] = [];

    if (isWebtoon) {
      downloadManager.update((index / total) * 100, `Fetching images for ${chapter.title}`);
      const webtoonResp = await axios.get(`${serverUrl}/scrape-webtoon`, {
        params: { mangaUrl, chapter: chapter.url },
        timeout: 90000,
      });
      if (webtoonResp.data?.success && Array.isArray(webtoonResp.data.images)) {
        images = webtoonResp.data.images.map((img: any) => img.url);
      }
    } else {
      const totalPages = infoResp.data?.totalPages || 0;
      const maxPages = totalPages > 0 ? totalPages : 50; // fallback upper bound
      downloadManager.update((index / total) * 100, `Fetching images for ${chapter.title}`);
      for (let p = 1; p <= maxPages; p++) {
        try {
          const pageResp = await axios.get(`${serverUrl}/scrape-image`, {
            params: { mangaUrl, chapter: chapter.url, page: p },
            timeout: 20000,
          });
          if (pageResp.data?.success && pageResp.data?.image) {
            images.push(pageResp.data.image);
            if (totalPages > 0 && p >= totalPages) break;
          } else if (totalPages === 0) {
            // stop on first failure in fallback mode
            break;
          }
        } catch (e) {
          if (totalPages === 0) break;
        }
      }
    }

    if (images.length === 0) {
      throw new Error('No pages downloaded');
    }

    const pagePaths: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const imageUrl = images[i];
      const ext = imageUrl.includes('.png') ? 'png' : 'jpg';
      const target = `${chapterDir}/page-${i + 1}.${ext}`;
      const pctBase = (index / total) * 100;
      const pct = images.length > 0 ? pctBase + ((i + 1) / images.length) * (100 / total) : pctBase;
      downloadManager.update(pct, `Downloading ${chapter.title} (${i + 1}/${images.length})`);
      await downloadBinary(getProxiedImageUrl(imageUrl), target);
      pagePaths.push(target);
    }

    return {
      url: chapter.url,
      title: chapter.title,
      isWebtoon,
      pages: pagePaths,
    };
  };

  const handleDownloadSelected = () => {
    if (!mangaDetails || selectedChapterIds.size === 0) return;
    const chosenChapters = chapters.filter(ch => selectedChapterIds.has(ch.url));
    const title = mangaDetails.title;
    setDownloadModalVisible(false);
    setSelectedChapterIds(new Set());

    (async () => {
      try {
        downloadManager.start(title, 'Preparing download...');
        await ensureDir(downloadsRoot);

        const mangaDir = `${downloadsRoot}/${safeName(mangaUrl)}`;
        await ensureDir(mangaDir);
        const coverExt = mangaDetails.coverImage?.includes('.png') ? 'png' : 'jpg';
        const coverPath = `${mangaDir}/cover.${coverExt}`;
        if (mangaDetails.coverImage) {
          downloadManager.update(0, 'Downloading cover');
          await downloadBinary(getProxiedImageUrl(mangaDetails.coverImage), coverPath);
        }

        const downloadedChapters: any[] = [];
        for (let i = 0; i < chosenChapters.length; i++) {
          const result = await downloadChapter(chosenChapters[i], i, chosenChapters.length);
          if (result) downloadedChapters.push(result);
        }

        const manifest = await readDownloadsManifest();
        const filtered = manifest.filter((m: any) => m.mangaUrl !== mangaUrl);
        filtered.push({
          mangaUrl,
          title: mangaDetails.title,
          coverImageLocal: coverPath,
          author: mangaDetails.author,
          status: mangaDetails.status,
          genres: mangaDetails.genres,
          chapters: downloadedChapters,
        });
        await writeDownloadsManifest(filtered);

        downloadManager.complete('Downloads ready');
      } catch (err: any) {
        console.error('Download failed:', err?.message);
        downloadManager.fail('Download failed');
      }
    })();
  };

  const getProxiedUrl = (imageUrl: string) => getProxiedImageUrl(imageUrl, true);

  const handleChapterPress = (chapter: Chapter) => {
    console.log('[ChapterList] Navigating with genres:', mangaDetails?.genres);
    saveToHistory(chapter).catch(() => {});
    navigation.navigate('MangaReader', {
      mangaUrl,
      mangaName: mangaDetails?.title || mangaName,
      selectedChapter: chapter.url,
      genres: mangaDetails?.genres || [],
      coverImage: mangaDetails?.coverImage || '',
      currentChapterName: chapter.title,
    });
  };

  const toggleChapterSelection = (url: string) => {
    setSelectedChapterIds(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  };

  const renderChapter = ({ item, index }: { item: Chapter; index: number }) => {
    // Determine if this chapter has been read
    const lastReadUrl = lastReadChapter?.url;
    const lastReadIndex = lastReadUrl ? chapters.findIndex(ch => ch.url === lastReadUrl) : -1;
    // Chapters are newest first; chapters AFTER the last read index are older = already read
    const isRead = lastReadIndex !== -1 && index > lastReadIndex;
    const isCurrent = item.url === lastReadUrl;
    
    return (
      <TouchableOpacity 
        style={[styles.chapterCard, isRead && styles.chapterCardRead]}
        onPress={() => handleChapterPress(item)}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          {(isRead || isCurrent) && (
            <Icon 
              name={isRead ? 'checkmark-circle' : 'ellipse'} 
              size={16} 
              color={isRead ? '#4a9eff' : '#ffa500'} 
              style={{ marginRight: 8 }}
            />
          )}
          <Text style={[styles.chapterText, isRead && styles.chapterTextRead]} numberOfLines={1}>{item.title}</Text>
        </View>
        <Text style={styles.arrow}>→</Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6200ea" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={chapters}
        keyExtractor={(item, index) => index.toString()}
        renderItem={renderChapter}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4a9eff" colors={['#4a9eff']} />
        }
        ListHeaderComponent={
          mangaDetails ? (
            <View style={styles.mangaInfoContainer}>
              {/* Cover and Title Section */}
              <View style={styles.headerSection}>
                <Image
                  source={{ uri: getProxiedUrl(mangaDetails.coverImage) }}
                  style={styles.coverImage}
                  resizeMode="cover"
                />
                <View style={styles.headerInfo}>
                  <View style={styles.titleRow}>
                    <Text style={styles.mangaTitle} numberOfLines={3}>{mangaDetails.title}</Text>
                    <TouchableOpacity onPress={toggleFavorite} style={styles.heartButton}>
                      <Icon
                        name={isFavorite ? 'heart' : 'heart-outline'}
                        size={24}
                        color={isFavorite ? '#ff5b5b' : '#ccc'}
                      />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.author}>{mangaDetails.author}</Text>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>{mangaDetails.status}</Text>
                  </View>
                </View>
              </View>

              {/* Genres */}
              {mangaDetails.genres.length > 0 && (
                <View style={styles.genresContainer}>
                  {mangaDetails.genres.map((genre, index) => (
                    <View key={index} style={styles.genreBadge}>
                      <Text style={styles.genreText}>{genre}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Description */}
              <View style={styles.descriptionContainer}>
                <Text style={styles.descriptionTitle}>Description</Text>
                <Text style={styles.descriptionText} numberOfLines={5}>{mangaDetails.description}</Text>
              </View>

              {/* Chapters Header */}
              <View style={styles.chaptersHeader}>
                <Text style={styles.chaptersHeaderText}>Chapters ({chapters.length})</Text>
                <View style={styles.headerButtons}>
                  {lastReadChapter && (
                    <TouchableOpacity style={styles.downloadButton} onPress={handleContinueReading}>
                      <Icon name="time" size={18} color="#fff" />
                      <Text style={styles.downloadButtonText}>Continue</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.downloadButton} onPress={() => setDownloadModalVisible(true)}>
                    <Icon name="download" size={18} color="#fff" />
                    <Text style={styles.downloadButtonText}>Download</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null
          }
        />

      <Modal
        visible={downloadModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDownloadModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select chapters to download</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {chapters.map((ch) => {
                const selected = selectedChapterIds.has(ch.url);
                return (
                  <TouchableOpacity
                    key={ch.url}
                    style={styles.modalRow}
                    onPress={() => toggleChapterSelection(ch.url)}
                  >
                    <Icon
                      name={selected ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={selected ? '#4a9eff' : '#888'}
                    />
                    <Text style={styles.modalRowText} numberOfLines={1}>{ch.title}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#444' }]}
                onPress={() => setDownloadModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: selectedChapterIds.size === 0 ? '#555' : '#4a9eff', marginLeft: 10 }]}
                onPress={handleDownloadSelected}
                disabled={selectedChapterIds.size === 0}
              >
                <Text style={styles.modalButtonText}>Download</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  loadingText: {
    color: '#aaa',
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  listContent: {
    paddingBottom: 20,
  },
  mangaInfoContainer: {
    backgroundColor: '#121212',
    paddingBottom: 15,
  },
  headerSection: {
    flexDirection: 'row',
    padding: 15,
    paddingBottom: 15,
  },
  coverImage: {
    width: 120,
    height: 170,
    borderRadius: 8,
    backgroundColor: '#2C2C2C',
  },
  headerInfo: {
    flex: 1,
    marginLeft: 15,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mangaTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  heartButton: {
    marginLeft: 10,
  },
  author: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 10,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#6200ea',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 15,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  genreBadge: {
    backgroundColor: '#2C2C2C',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    marginRight: 8,
    marginBottom: 8,
  },
  genreText: {
    color: '#ddd',
    fontSize: 12,
  },
  descriptionContainer: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  descriptionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: 14,
    color: '#bbb',
    lineHeight: 20,
  },
  chaptersHeader: {
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: '#121212',
    borderTopWidth: 1,
    borderTopColor: '#2C2C2C',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chaptersHeaderText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3a4f6b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  downloadButtonText: {
    color: '#fff',
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '600',
  },
  chapterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#121212',
    padding: 15,
    marginHorizontal: 0,
    marginBottom: 1,
  },
  chapterCardRead: {
    opacity: 0.6,
  },
  chapterText: {
    color: '#fff',
    fontSize: 15,
    flex: 1,
  },
  chapterTextRead: {
    color: '#888',
  },
  arrow: {
    color: '#6200ea',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  modalRowText: {
    color: '#fff',
    marginLeft: 10,
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  modalButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  downloadStatus: {
    color: '#9ec1ff',
    marginTop: 8,
  },
});

export default ChapterList;
