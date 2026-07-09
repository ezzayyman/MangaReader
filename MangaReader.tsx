import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Dimensions,
  Modal,
  FlatList,
  ScrollView,
  Platform,
  NativeModules,
} from "react-native";
import Slider from '@react-native-community/slider';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import axios from "axios";
import RNFS from 'react-native-fs';
import { SERVER_URL, COLORS } from './config';
import {
  readHistory,
  writeHistory,
  readSettings,
  readStats,
  writeStats,
  getProxiedImageUrl as proxyImage,
  AppSettings,
  DEFAULT_SETTINGS,
} from './utils';

type Chapter = {
  title: string;
  url: string;
};

const MangaReader = ({ route, navigation }: any) => {
  const serverUrl = SERVER_URL;
  
  // Helper to proxy images through our server
  const getProxiedImageUrl = (imageUrl: string) => proxyImage(imageUrl);

  // Settings state
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const sessionStartRef = useRef<number>(Date.now());
  const pagesReadThisSessionRef = useRef<number>(0);
  
  // Get params including genres
  const { mangaUrl, mangaName, selectedChapter: initialChapter, genres } = route.params || {};
  const coverImageFromRoute = route.params?.coverImage || '';
  
  // Detect if this is a webtoon based on genres
  const isWebtoonGenre = genres && Array.isArray(genres) && genres.some((g: string) => g.toLowerCase().includes('webtoon'));
  console.log('[MangaReader] Genres received:', genres);
  console.log('[MangaReader] Is webtoon based on genre?', isWebtoonGenre);
  
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState(initialChapter || ""); // Use the passed chapter or empty
  const [currentPage, setCurrentPage] = useState(0); // Start at 0 so setting to 1 triggers useEffect
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""); // Error message state
  const [preloadedImages, setPreloadedImages] = useState<{ [key: number]: string }>({}); // Cache for preloaded images
  const [totalPages, setTotalPages] = useState(50); // Estimate total pages, adjust as needed
  const [preloading, setPreloading] = useState(false);
  const [activeChapter, setActiveChapter] = useState(""); // Track which chapter is being loaded
  const abortControllerRef = React.useRef<AbortController | null>(null); // To cancel requests
  const selectedChapterRef = React.useRef<string>(""); // Track current chapter (for closure access)
  const preloadIdRef = React.useRef<number>(0); // Unique ID for each preload session
  const [showChapterList, setShowChapterList] = useState(false); // Modal visibility
  const [showMenu, setShowMenu] = useState(false); // Menu modal visibility
  const webtoonPageRef = React.useRef<number>(1); // Track webtoon page without re-renders
  const scrollViewRef = React.useRef<any>(null); // Ref for webtoon ScrollView
  const autoNextChapterTriggered = React.useRef<boolean>(false); // Prevent multiple auto-next triggers
  
  // Webtoon mode states - initialize based on genre detection
  const [isWebtoon, setIsWebtoon] = useState(isWebtoonGenre);
  const manualModeOverride = React.useRef<boolean>(false); // True when user manually toggled mode
  const [webtoonImages, setWebtoonImages] = useState<string[]>([]);
  const [loadingWebtoon, setLoadingWebtoon] = useState(false);
  const [webtoonSizes, setWebtoonSizes] = useState<{ [index: number]: { width: number; height: number } }>({});
  const [webtoonHiResFailed, setWebtoonHiResFailed] = useState<{ [index: number]: boolean }>({});

  // Load settings on mount
  useEffect(() => {
    readSettings().then(setAppSettings);
  }, []);

  // Keep screen awake while reading
  useEffect(() => {
    if (appSettings.keepScreenAwake && Platform.OS === 'android') {
      try {
        NativeModules.KeepAwake?.activate?.();
      } catch (e) { /* not available */ }
    }
    return () => {
      if (Platform.OS === 'android') {
        try {
          NativeModules.KeepAwake?.deactivate?.();
        } catch (e) { /* not available */ }
      }
    };
  }, [appSettings.keepScreenAwake]);

  // Save reading stats on unmount
  useEffect(() => {
    return () => {
      const timeSpent = Date.now() - sessionStartRef.current;
      const pagesRead = pagesReadThisSessionRef.current;
      if (pagesRead > 0 || timeSpent > 5000) {
        readStats().then(stats => {
          writeStats({
            ...stats,
            totalPagesRead: stats.totalPagesRead + pagesRead,
            totalTimeSpentMs: stats.totalTimeSpentMs + timeSpent,
          });
        });
      }
    };
  }, []);

  const saveToHistory = async (chapterTitle: string) => {
    if (!mangaUrl || !mangaName || !selectedChapter) return;
    const total = chapters.length || 1;
    const idx = chapters.findIndex(c => c.url === selectedChapter);
    const completion = idx !== -1 ? Math.round(((total - idx) / total) * 100) : 0;
    const list = await readHistory();
    const filtered = list.filter((item: any) => item.mangaUrl !== mangaUrl);
    const updated = [
      {
        mangaUrl,
        title: mangaName,
        coverImage: coverImageFromRoute,
        lastChapterUrl: selectedChapter,
        lastChapterTitle: chapterTitle,
        timestamp: Date.now(),
        progress: Math.min(100, Math.max(0, completion)),
        lastPage: currentPage,
        totalPages: totalPages,
      },
      ...filtered,
    ];
    await writeHistory(updated);
  };

  // Fetch all chapters on load
  const fetchChapters = async () => {
    if (!mangaUrl) {
      console.error("No manga URL provided");
      return;
    }
    try {
      setLoading(true);
      const response = await axios.get(`${serverUrl}/chapters`, {
        params: { mangaUrl },
      });

      if (response.data.success && response.data.chapters.length > 0) {
        setChapters(response.data.chapters);
        
        // Update header with initial chapter name if we have one
        if (initialChapter) {
          const currentChapter = response.data.chapters.find((ch: Chapter) => ch.url === initialChapter);
          if (currentChapter) {
            navigation.setParams({ currentChapterName: currentChapter.title });
          }
        }
        
        // If no chapter was selected from ChapterList, use the first one
        if (!initialChapter) {
          const firstChapter = response.data.chapters[0]?.url || "";
          setSelectedChapter(firstChapter);
        }
      } else {
        setError("No chapters found.");
      }
    } catch (error) {
      console.error("Error fetching chapters from server:", error);
      setError("Failed to load chapters.");
    } finally {
      setLoading(false);
    }
  };

  // Load all images for a webtoon chapter
  const loadWebtoonChapter = async (chapter: string) => {
    if (!mangaUrl || !chapter) return;
    
    console.log('Loading webtoon chapter...');
    setLoadingWebtoon(true);
    setWebtoonImages([]);
    setWebtoonSizes({});
    setWebtoonHiResFailed({});
    
    try {
      const response = await axios.get(`${serverUrl}/scrape-webtoon`, {
        params: { mangaUrl, chapter },
        timeout: 90000 // Increased to 90 seconds
      });
      
      console.log('Webtoon response:', response.data);
      
      if (response.data.success && response.data.images) {
        const imageUrls = response.data.images.map((img: any) => img.url); // store raw; proxy later
        console.log(`✓ Loaded ${imageUrls.length} webtoon images`);
        console.log('First image URL:', imageUrls[0]);
        console.log('Setting webtoon images state...');
        setWebtoonImages(imageUrls);
        console.log('Setting total pages:', imageUrls.length);
        setTotalPages(imageUrls.length);
        console.log('Setting loading to false');
        setLoading(false);
        setError(''); // Clear any previous errors
        console.log('Webtoon chapter loaded successfully!');
        
        // Prefetch all images for smooth scrolling
        console.log('Starting image prefetch...');
        imageUrls.forEach((url: string, index: number) => {
          const proxiedUrl = getProxiedImageUrl(url);
          Image.prefetch(proxiedUrl).catch(err => {
            console.log(`Failed to prefetch image ${index}:`, err);
          });
        });
        console.log('Image prefetch initiated for all images');
      } else {
        console.error('Failed to load webtoon images:', response.data);
        setError('Failed to load webtoon chapter');
        setLoading(false);
      }
    } catch (error: any) {
      console.error('Error loading webtoon:', error.message);
      setError('Failed to load webtoon chapter');
      setLoading(false);
    } finally {
      setLoadingWebtoon(false);
    }
  };

  // Preload pages in small batches to avoid browser crashes
  const preloadPages = async (chapter: string, startPage: number, maxPages: number) => {
    if (!mangaUrl || !chapter) return;
    
    const myPreloadId = ++preloadIdRef.current;
    console.log(`[Preload #${myPreloadId}] Starting preload for ALL pages ${startPage}-${maxPages}`);
    
    if (chapter !== selectedChapterRef.current) {
      console.log(`[Preload #${myPreloadId}] ABORT: Chapter already changed`);
      return;
    }
    
    setPreloading(true);
    
    // Create array of ALL page numbers to load at once
    const allPages = [];
    for (let i = startPage; i <= maxPages; i++) {
      allPages.push(i);
    }
    
    try {
      console.log(`[Preload #${myPreloadId}] Loading ALL ${allPages.length} pages in one batch...`);
      
      const response = await axios.post(`${serverUrl}/scrape-images-batch`, {
        mangaUrl,
        chapter,
        pages: allPages
      }, {
        timeout: 120000, // 2 minutes timeout for large chapters
        signal: abortControllerRef.current?.signal
      });
      
      if (chapter !== selectedChapterRef.current) {
        console.log(`[Preload #${myPreloadId}] DISCARDING: Chapter changed`);
        setPreloading(false);
        return;
      }
      
      if (response.data.success && response.data.images) {
        const newImages: { [key: number]: string } = {};
        
        response.data.images.forEach((img: any) => {
          // Proxy all image URLs through our server
          const proxiedUrl = getProxiedImageUrl(img.image);
          newImages[img.page] = proxiedUrl;
        });
        
        setPreloadedImages(prev => ({
          ...prev,
          ...newImages
        }));
        
        console.log(`✓ ALL pages loaded: ${response.data.images.length}/${allPages.length} pages cached!`);
      }
      
    } catch (err) {
      if (axios.isCancel(err) || (err as any).name === 'CanceledError') {
        console.log(`[Preload #${myPreloadId}] CANCELLED`);
      } else {
        console.log(`[Preload #${myPreloadId}] Error:`, err);
      }
    }
    
    setPreloading(false);
    console.log(`[Preload #${myPreloadId}] COMPLETE`);
  };

  // Fetch single page image (only if not already cached)
  const fetchPage = async (page: number): Promise<void> => {
    if (!mangaUrl || !selectedChapter) {
      console.error("Manga URL or chapter not available");
      return;
    }
    
    // IMPORTANT: Check cache FIRST - don't re-fetch if already loaded
    if (preloadedImages[page]) {
      console.log(`Using cached page ${page}`);
      setImageUrl(preloadedImages[page]);
      setLoading(false);
      return;
    }
    
    console.log(`Fetching page ${page} (not in cache)`);
    setLoading(true);
    setError("");
    
    try {
      const response = await axios.get(`${serverUrl}/scrape-image`, {
        params: { mangaUrl, chapter: selectedChapter, page },
        signal: abortControllerRef.current?.signal, // Use abort signal
      });

      // CHECK: Only update if still on same chapter
      if (selectedChapter !== activeChapter) {
        console.log(`Ignoring page ${page} response - chapter changed`);
        setLoading(false);
        return;
      }

      if (response.data.success) {
        console.log('Server response:', response.data);
        
        // Proxy the image URL through our server
        const proxiedUrl = getProxiedImageUrl(response.data.image);
        
        console.log('Proxied image URL to display:', proxiedUrl);
        
        setImageUrl(proxiedUrl);
        
        // Update total pages if server provides it (important for first page load)
        if (response.data.totalPages) {
          console.log(`✓ Total pages from image response: ${response.data.totalPages}`);
          setTotalPages(response.data.totalPages);
        }
        
        // Add to cache
        setPreloadedImages(prev => ({
          ...prev,
          [page]: proxiedUrl
        }));
        
        console.log("Image loaded and cached:", proxiedUrl);
        
        // Prefetch next 2 pages using React Native's Image.prefetch for instant loading
        for (let i = 1; i <= 2; i++) {
          const nextPage = page + i;
          if (nextPage <= totalPages && preloadedImages[nextPage]) {
            Image.prefetch(preloadedImages[nextPage]).catch(() => {});
          }
        }
      } else {
        setError("Failed to load image.");
      }
    } catch (error) {
      if (axios.isCancel(error) || (error as any).name === 'CanceledError') {
        console.log(`Request cancelled for page ${page}`);
      } else {
        console.error("Error fetching image from server:", error);
        setError("Failed to load image.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch chapters on component mount
  useEffect(() => {
    fetchChapters();
    
    // Cleanup function: abort all requests when component unmounts (user goes back to library)
    return () => {
      console.log('MangaReader unmounting - cancelling all requests');
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setPreloading(false);
    };
  }, []);

  // Preload pages when the chapter changes
  useEffect(() => {
    if (selectedChapter) {
      console.log('========================================');
      console.log(`Chapter changed to: ${selectedChapter}`);
      console.log('========================================');
      
      // Reset auto-next trigger for new chapter
      autoNextChapterTriggered.current = false;
      
      // CRITICAL: Cancel all ongoing requests from previous chapter
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        console.log('Aborted previous chapter requests');
      }
      
      // Create new abort controller for this chapter
      abortControllerRef.current = new AbortController();
      
      // Reset everything IMMEDIATELY
      setPreloadedImages({}); // CLEAR cache from previous chapter
      setImageUrl(''); // Clear current image
      setActiveChapter(selectedChapter); // Mark this as active chapter
      selectedChapterRef.current = selectedChapter; // Update ref for closure access
      setPreloading(false);
      setTotalPages(1); // Will be updated once we fetch chapter info
      
      // Update header with current chapter name
      const currentChapter = chapters.find(ch => ch.url === selectedChapter);
      if (currentChapter) {
        navigation.setParams({ currentChapterName: currentChapter.title });
      }
      
      // Fetch chapter info to detect if it's a webtoon
      console.log('Fetching chapter info...');
      setLoading(true);
      
      axios.get(`${serverUrl}/chapter-info`, {
        params: { mangaUrl, chapter: selectedChapter },
        timeout: 20000
      }).then(response => {
        console.log('Chapter info response:', response.data);
        
        if (response.data.success) {
          if (response.data.isWebtoon && !manualModeOverride.current) {
            // This is a webtoon - load all images at once (unless user manually overrode)
            console.log('✓ Detected WEBTOON mode');
            setIsWebtoon(true);
            setCurrentPage(1); // Reset page counter
            loadWebtoonChapter(selectedChapter);
          } else if (response.data.totalPages) {
            // Regular manga with pagination
            const actualPageCount = response.data.totalPages;
            console.log(`✓ Chapter has ${actualPageCount} pages`);
            setIsWebtoon(false);
            setTotalPages(actualPageCount);
            
            // Load page 1 now that we know the total pages
            setCurrentPage(1);
            
            // Start preloading from page 2 with ACTUAL page count
            setTimeout(() => {
              if (selectedChapter === selectedChapterRef.current) {
                console.log(`Starting preload for pages 2-${actualPageCount}`);
                preloadPages(selectedChapter, 2, actualPageCount);
              }
            }, 100);
          } else {
            // No totalPages in response, try to fetch page 1 anyway
            console.log('No totalPages in response, loading page 1...');
            setIsWebtoon(false);
            setCurrentPage(1);
          }
        } else {
          console.error('Chapter info failed:', response.data.error);
          setError('Failed to load chapter info');
          setLoading(false);
        }
      }).catch(err => {
        console.error('Failed to get chapter info:', err.message);
        setError('Failed to load chapter. Please try again.');
        setLoading(false);
      });
      
      // Page 1 will be loaded after chapter-info is fetched
    }
  }, [selectedChapter]);

    useEffect(() => {
      if (!selectedChapter || chapters.length === 0) return;
      const current = chapters.find(ch => ch.url === selectedChapter);
      if (!current) return;
      saveToHistory(current.title).catch(() => {});
    }, [selectedChapter, chapters]);

  // Update displayed image when current page changes
  useEffect(() => {
    console.log(`currentPage useEffect triggered: page=${currentPage}, chapter=${selectedChapter}`);
    if (selectedChapter && currentPage > 0) {
      console.log(`Calling fetchPage(${currentPage})`);
      fetchPage(currentPage);
      
      // Update header with current page
      navigation.setParams({ currentPage, totalPages });
    } else {
      console.log(`Skipping fetchPage: selectedChapter=${!!selectedChapter}, currentPage=${currentPage}`);
    }
  }, [currentPage, selectedChapter, totalPages]);

  const nextPage = () => {
    pagesReadThisSessionRef.current += 1;
    if (currentPage < totalPages) {
      setCurrentPage((prev) => prev + 1);
    } else {
      // On last page, go to next chapter
      goToNextChapter();
    }
  };
  
  const prevPage = () => setCurrentPage((prev) => (prev > 1 ? prev - 1 : prev));

  const goToNextChapter = () => {
    if (!selectedChapter || chapters.length === 0) return;
    
    const currentIndex = chapters.findIndex(ch => ch.url === selectedChapter);
    if (currentIndex !== -1 && currentIndex > 0) {
      // Chapters are in descending order, so index - 1 is the next chapter
      const nextChapter = chapters[currentIndex - 1];
      console.log(`Going to next chapter: ${nextChapter.title}`);
      // Track chapter completion in stats
      readStats().then(stats => {
        writeStats({ ...stats, totalChaptersCompleted: stats.totalChaptersCompleted + 1 });
      });
      setSelectedChapter(nextChapter.url);
    } else {
      console.log('Already on latest chapter');
    }
  };

  const goToPrevChapter = () => {
    if (!selectedChapter || chapters.length === 0) return;
    
    const currentIndex = chapters.findIndex(ch => ch.url === selectedChapter);
    if (currentIndex !== -1 && currentIndex < chapters.length - 1) {
      // Chapters are in descending order, so index + 1 is the previous chapter
      const prevChapter = chapters[currentIndex + 1];
      console.log(`Going to previous chapter: ${prevChapter.title}`);
      setSelectedChapter(prevChapter.url);
    } else {
      console.log('Already on first chapter');
    }
  };

  const refreshChapter = () => {
    console.log('Refreshing chapter - clearing cache');
    setPreloadedImages({}); // Clear all cached images
    setImageUrl(''); // Clear current image
    setShowMenu(false); // Close menu
    
    // Refetch current page
    if (currentPage > 0) {
      fetchPage(currentPage);
      
      // Restart preloading from page 2
      setTimeout(() => {
        if (selectedChapter === selectedChapterRef.current) {
          preloadPages(selectedChapter, 2, totalPages);
        }
      }, 500);
    }
  };

  const toggleReadingMode = () => {
    manualModeOverride.current = true;
    setShowMenu(false);
    if (isWebtoon) {
      // Switch to manga (paginated) mode - reload chapter as paginated
      console.log('Switching to Manga mode');
      setIsWebtoon(false);
      setWebtoonImages([]);
      setWebtoonSizes({});
      setPreloadedImages({});
      setImageUrl('');
      setCurrentPage(0);
      // Re-fetch as paginated
      setLoading(true);
      axios.get(`${serverUrl}/chapter-info`, {
        params: { mangaUrl, chapter: selectedChapter },
        timeout: 20000
      }).then(response => {
        if (response.data.success && response.data.totalPages) {
          const actualPageCount = response.data.totalPages;
          setTotalPages(actualPageCount);
          setCurrentPage(1);
          setTimeout(() => {
            if (selectedChapter === selectedChapterRef.current) {
              preloadPages(selectedChapter, 2, actualPageCount);
            }
          }, 100);
        } else {
          setCurrentPage(1);
        }
      }).catch(() => {
        setCurrentPage(1);
        setLoading(false);
      });
    } else {
      // Switch to webtoon (scroll) mode - fetch all pages and display vertically
      console.log('Switching to Webtoon mode');
      setIsWebtoon(true);
      setImageUrl('');
      setCurrentPage(1);
      setLoading(true);

      // First get total page count, then fetch all page URLs
      axios.get(`${serverUrl}/chapter-info`, {
        params: { mangaUrl, chapter: selectedChapter },
        timeout: 20000
      }).then(async (response) => {
        if (response.data.success && response.data.totalPages) {
          const pageCount = response.data.totalPages;
          setTotalPages(pageCount);
          console.log(`Fetching ${pageCount} pages for webtoon scroll view...`);
          
          // Fetch all page image URLs in parallel
          const pagePromises = [];
          for (let p = 1; p <= pageCount; p++) {
            pagePromises.push(
              axios.get(`${serverUrl}/scrape-image`, {
                params: { mangaUrl, chapter: selectedChapter, page: p },
                timeout: 20000
              }).then(r => {
                if (r.data.success) return r.data.image; // Store raw URL, not proxied
                return '';
              }).catch(() => '')
            );
          }
          
          const urls = await Promise.all(pagePromises);
          const validUrls = urls.filter(u => u !== '');
          console.log(`✓ Loaded ${validUrls.length}/${pageCount} page URLs for scroll view`);
          setWebtoonImages(validUrls);
          setTotalPages(validUrls.length);
          setLoading(false);
        } else {
          setError('Could not determine page count');
          setLoading(false);
        }
      }).catch(() => {
        setError('Failed to load chapter for scroll mode');
        setLoading(false);
      });
    }
  };

  return (
    <View style={styles.container}>
      {/* Chapter List Modal */}
      <Modal
        visible={showChapterList}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowChapterList(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Chapter</Text>
              <TouchableOpacity style={styles.closeButtonWrap} onPress={() => setShowChapterList(false)}>
                <Icon name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={chapters}
              keyExtractor={(item) => item.url}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.chapterItem,
                    item.url === selectedChapter && styles.chapterItemSelected
                  ]}
                  onPress={() => {
                    setSelectedChapter(item.url);
                    setShowChapterList(false);
                  }}
                >
                  {item.url === selectedChapter && <View style={styles.chapterAccentBar} />}
                  <Text style={[
                    styles.chapterItemText,
                    item.url === selectedChapter && styles.chapterItemTextSelected
                  ]}>{item.title}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Menu Modal */}
      <Modal
        visible={showMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowMenu(false)}>
          <View style={styles.menuOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.menuContent}>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={refreshChapter}
                >
                  <Icon name="refresh" size={18} color={COLORS.textPrimary} style={{ marginRight: 10 }} />
                  <Text style={styles.menuItemText}>Refresh Chapter</Text>
                </TouchableOpacity>
                <View style={styles.menuDivider} />
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={toggleReadingMode}
                >
                  <Icon name={isWebtoon ? 'book-outline' : 'swap-vertical'} size={18} color={COLORS.textPrimary} style={{ marginRight: 10 }} />
                  <Text style={styles.menuItemText}>{isWebtoon ? 'Manga Mode' : 'Webtoon Mode'}</Text>
                  <View style={styles.modeBadge}>
                    <Text style={styles.modeBadgeText}>{isWebtoon ? 'L/R' : '↕'}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Image Display with Touch Navigation */}
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.accent} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : isWebtoon && webtoonImages.length > 0 ? (
        /* Webtoon Mode - FlatList for memory-efficient rendering (only visible images decoded at full quality) */
        <FlatList
          ref={scrollViewRef}
          data={webtoonImages}
          keyExtractor={(item, index) => `${index}-${item}`}
          style={styles.webtoonContainer}
          contentContainerStyle={styles.webtoonContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          scrollEventThrottle={16}
          windowSize={5}
          maxToRenderPerBatch={3}
          initialNumToRender={3}
          getItemLayout={webtoonSizes && Object.keys(webtoonSizes).length === webtoonImages.length
            ? (data, index) => {
                const screenW = Dimensions.get('window').width;
                let offset = 0;
                for (let i = 0; i < index; i++) {
                  offset += webtoonSizes[i]?.width
                    ? (webtoonSizes[i].height / webtoonSizes[i].width) * screenW
                    : screenW * 1.4;
                }
                const length = webtoonSizes[index]?.width
                  ? (webtoonSizes[index].height / webtoonSizes[index].width) * screenW
                  : screenW * 1.4;
                return { length, offset, index };
              }
            : undefined
          }
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            const scrollY = contentOffset.y;
            const scrollHeight = contentSize.height;
            const viewHeight = layoutMeasurement.height;
            
            // Calculate current page position
            let accumulatedHeight = 0;
            let currentImageIndex = 0;
            const screenW = Dimensions.get('window').width;
            
            for (let i = 0; i < webtoonImages.length; i++) {
              const imageHeight = webtoonSizes[i]?.width
                ? (webtoonSizes[i].height / webtoonSizes[i].width) * screenW
                : screenW * 1.4;
              
              if (accumulatedHeight + imageHeight / 2 > scrollY) {
                currentImageIndex = i;
                break;
              }
              accumulatedHeight += imageHeight;
            }
            
            webtoonPageRef.current = currentImageIndex + 1;
            
            // Check if user reached the bottom (for auto next chapter)
            const distanceFromBottom = scrollHeight - (scrollY + viewHeight);
            if (distanceFromBottom < 100 && !autoNextChapterTriggered.current) {
              autoNextChapterTriggered.current = true;
              goToNextChapter();
            }
          }}
          renderItem={({ item: rawUrl, index }) => {
            // Try hi-res: strip /compressed/ from the raw URL
            const hiResCandidate = rawUrl.includes('/compressed/')
              ? rawUrl.replace('/compressed/', '/')
              : rawUrl;
            const chosenUrl = webtoonHiResFailed[index] ? rawUrl : hiResCandidate;
            const proxiedUrl = chosenUrl.includes('/proxy-image')
              ? chosenUrl
              : getProxiedImageUrl(chosenUrl);
            const screenW = Dimensions.get('window').width;

            return (
              <Image
                source={{ uri: proxiedUrl }}
                style={[
                  styles.webtoonImage,
                  {
                    height: webtoonSizes[index]?.width
                      ? (webtoonSizes[index].height / webtoonSizes[index].width) * screenW
                      : screenW * 1.4,
                  },
                ]}
                resizeMode="contain"
                progressiveRenderingEnabled={true}
                fadeDuration={0}
                onLoad={({ nativeEvent }) => {
                  const { width, height } = nativeEvent.source;
                  if (!webtoonSizes[index]) {
                    setWebtoonSizes((prev) => ({ ...prev, [index]: { width, height } }));
                  }
                }}
                onError={() => {
                  if (!webtoonHiResFailed[index]) {
                    setWebtoonHiResFailed((prev) => ({ ...prev, [index]: true }));
                  }
                }}
              />
            );
          }}
        />
      ) : imageUrl ? (
        /* Regular Manga Mode - Page by Page */
        <View style={styles.imageContainer}>
          <TouchableWithoutFeedback
            onPress={(event) => {
              const { locationX } = event.nativeEvent;
              const screenWidth = Dimensions.get('window').width;
              
              // Reading direction: LTR = left prev/right next, RTL = left next/right prev
              const isRTL = appSettings.readingDirection === 'rtl';
              if (locationX < screenWidth / 2) {
                isRTL ? nextPage() : prevPage();
              } else {
                isRTL ? prevPage() : nextPage();
              }
            }}
          >
            <Image
              style={styles.image}
              source={{ uri: imageUrl, cache: 'force-cache' }}
              resizeMode="contain"
            />
          </TouchableWithoutFeedback>
        </View>
      ) : (
        <View style={styles.errorContainer}>
          <Icon name="alert-circle-outline" size={48} color={COLORS.error} style={{ marginBottom: 12 }} />
          <Text style={styles.errorText}>{error || 'No image URL available'}</Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={() => {
              setError('');
              setCurrentPage(1);
              // Re-fetch chapter info
              const currentChapter = selectedChapter;
              setSelectedChapter('');
              setTimeout(() => setSelectedChapter(currentChapter), 100);
            }}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom Navigation Bar */}
      <LinearGradient
        colors={['rgba(16,16,16,0.92)', 'rgba(10,10,10,0.98)']}
        style={styles.bottomBar}
      >
        <TouchableOpacity style={styles.bottomIconButton} onPress={goToPrevChapter}>
          <Icon name="play-skip-back" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        
        <Slider
          style={styles.slider}
          minimumValue={1}
          maximumValue={totalPages}
          value={isWebtoon ? webtoonPageRef.current : currentPage}
          onSlidingComplete={(value) => {
            const targetPage = Math.round(value);
            if (isWebtoon) {
              const screenW = Dimensions.get('window').width;
              let scrollY = 0;
              for (let i = 0; i < targetPage - 1; i++) {
                const imageHeight = webtoonSizes[i]?.width
                  ? (webtoonSizes[i].height / webtoonSizes[i].width) * screenW
                  : screenW * 1.4;
                scrollY += imageHeight;
              }
              scrollViewRef.current?.scrollToOffset({ offset: scrollY, animated: true });
              webtoonPageRef.current = targetPage;
            } else {
              setCurrentPage(targetPage);
            }
          }}
          minimumTrackTintColor={COLORS.accent}
          maximumTrackTintColor={COLORS.textTertiary}
          thumbTintColor={COLORS.textPrimary}
        />
        
        <TouchableOpacity style={styles.bottomIconButton} onPress={goToNextChapter}>
          <Icon name="play-skip-forward" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.bottomIconButton} onPress={() => setShowChapterList(true)}>
          <Icon name="list" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.bottomIconButton} onPress={() => setShowMenu(true)}>
          <Icon name="ellipsis-vertical" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'flex-start',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.06)',
    elevation: 12,
  },
  bottomIconButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
  },
  slider: {
    flex: 1,
    marginHorizontal: 8,
    height: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: 24,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  closeButtonWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chapterItem: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chapterItemSelected: {
    backgroundColor: COLORS.accentSoft,
  },
  chapterAccentBar: {
    width: 3,
    height: 20,
    borderRadius: 1.5,
    backgroundColor: COLORS.accent,
    marginRight: 12,
  },
  chapterItemText: {
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  chapterItemTextSelected: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContent: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    minWidth: 220,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 8,
  },
  menuItem: {
    padding: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  menuDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 8,
  },
  modeBadge: {
    backgroundColor: COLORS.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginLeft: 8,
  },
  modeBadgeText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  imageContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 56,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  errorText: {
    fontSize: 16,
    color: COLORS.error,
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.2,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  retryButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
    elevation: 4,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  webtoonContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
  },
  webtoonContent: {
    alignItems: 'stretch',
    backgroundColor: '#000',
  },
  webtoonImage: {
    width: Dimensions.get('window').width,
    backgroundColor: '#000',
  },
});

export default MangaReader;
