import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, Modal, Dimensions } from 'react-native';
import Slider from '@react-native-community/slider';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import RNFS from 'react-native-fs';
import { DOWNLOADS_MANIFEST_PATH } from './utils';
import { COLORS } from './config';

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

const OfflineReader = ({ route }: any) => {
  const { mangaUrl, title: routeTitle } = route.params || {};
  const manifestPath = DOWNLOADS_MANIFEST_PATH;
  const [manga, setManga] = useState<DownloadedManga | null>(null);
  const [currentChapter, setCurrentChapter] = useState<DownloadedChapter | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [chapterModalVisible, setChapterModalVisible] = useState(false);
  const [webtoonSizes, setWebtoonSizes] = useState<{ [index: number]: { width: number; height: number } }>({});

  useEffect(() => {
    const load = async () => {
      try {
        const exists = await RNFS.exists(manifestPath);
        if (!exists) {
          setManga(null);
          return;
        }
        const raw = await RNFS.readFile(manifestPath, 'utf8');
        const parsed = JSON.parse(raw);
        const found = Array.isArray(parsed) ? parsed.find((m: any) => m.mangaUrl === mangaUrl) : null;
        setManga(found || null);
        if (found && found.chapters && found.chapters.length > 0) {
          setCurrentChapter(found.chapters[0]);
          setCurrentPage(1);
        }
      } catch (err) {
        console.error('OfflineReader load error', err);
        setManga(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [mangaUrl]);

  const totalPages = useMemo(() => currentChapter?.pages?.length || 0, [currentChapter]);

  const toFileUri = (p: string) => {
    if (!p) return '';
    return p.startsWith('file://') ? p : `file://${p}`;
  };

  const handleSelectChapter = (ch: DownloadedChapter) => {
    setCurrentChapter(ch);
    setCurrentPage(1);
    setWebtoonSizes({});
    setChapterModalVisible(false);
  };

  const goNextPage = () => {
    if (totalPages === 0) return;
    setCurrentPage(p => Math.min(totalPages, p + 1));
  };

  const goPrevPage = () => {
    if (totalPages === 0) return;
    setCurrentPage(p => Math.max(1, p - 1));
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.info}>Loading downloaded chapters...</Text>
      </View>
    );
  }

  if (!manga) {
    return (
      <View style={styles.centered}>
        <Icon name="cloud-offline-outline" size={48} color={COLORS.border} style={{ marginBottom: 12 }} />
        <Text style={styles.info}>No offline data found for this manga.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientEnd]} style={styles.header}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={styles.title} numberOfLines={1}>{manga.title || routeTitle || 'Offline Reader'}</Text>
          <Text style={styles.info} numberOfLines={1}>{currentChapter?.title || manga.author || ''}</Text>
        </View>
        <TouchableOpacity style={styles.chapterButton} onPress={() => setChapterModalVisible(true)}>
          <Icon name="list" size={16} color={COLORS.accent} />
          <Text style={styles.chapterButtonText}>Chapters</Text>
        </TouchableOpacity>
      </LinearGradient>

      <View style={styles.body}>
        {currentChapter?.isWebtoon ? (
          <ScrollView
            contentContainerStyle={styles.pageListWebtoon}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            scrollEventThrottle={16}
          >
            {currentChapter?.pages?.map((p, idx) => {
              const screenWidth = Dimensions.get('window').width;
              const dynamicHeight = webtoonSizes[idx]?.width
                ? (webtoonSizes[idx].height / webtoonSizes[idx].width) * screenWidth
                : Dimensions.get('window').height;
              return (
                <Image
                  key={`${p}-${idx}`}
                  source={{ uri: toFileUri(p) }}
                  style={[styles.webtoonImage, { height: dynamicHeight }]}
                  resizeMode="contain"
                  resizeMethod="scale"
                  progressiveRenderingEnabled
                  fadeDuration={0}
                  onLoad={({ nativeEvent }) => {
                    const { width, height } = nativeEvent.source;
                    if (!webtoonSizes[idx]) {
                      setWebtoonSizes(prev => ({ ...prev, [idx]: { width, height } }));
                    }
                  }}
                />
              );
            })}
            {(!currentChapter?.pages || currentChapter.pages.length === 0) && (
              <Text style={styles.info}>No pages in this chapter.</Text>
            )}
          </ScrollView>
        ) : (
          <View style={styles.readerArea}>
            {totalPages === 0 ? (
              <View style={styles.centered}>
                <Text style={styles.info}>No pages in this chapter.</Text>
              </View>
            ) : (
              <>
                <Image
                  source={{ uri: toFileUri(currentChapter?.pages?.[currentPage - 1] || '') }}
                  style={styles.pageImage}
                  resizeMode="contain"
                />
                <LinearGradient colors={['rgba(16,16,16,0.92)', 'rgba(10,10,10,0.98)']} style={styles.controls}>
                  <TouchableOpacity style={styles.controlButton} onPress={goPrevPage}>
                    <Icon name="chevron-back" size={18} color={COLORS.accent} />
                  </TouchableOpacity>
                  <View style={styles.sliderWrap}>
                    <Slider
                      minimumValue={1}
                      maximumValue={totalPages}
                      step={1}
                      value={currentPage}
                      minimumTrackTintColor={COLORS.accent}
                      maximumTrackTintColor={COLORS.textTertiary}
                      thumbTintColor={COLORS.accent}
                      onValueChange={v => setCurrentPage(Math.floor(v))}
                    />
                    <Text style={styles.pageIndicator}>{currentPage} / {totalPages}</Text>
                  </View>
                  <TouchableOpacity style={styles.controlButton} onPress={goNextPage}>
                    <Icon name="chevron-forward" size={18} color={COLORS.accent} />
                  </TouchableOpacity>
                </LinearGradient>
              </>
            )}
          </View>
        )}
      </View>

      <Modal
        visible={chapterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setChapterModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Downloaded Chapters</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {manga.chapters.map(ch => (
                <TouchableOpacity
                  key={ch.url}
                  style={[styles.modalRow, currentChapter?.url === ch.url && styles.modalRowActive]}
                  onPress={() => handleSelectChapter(ch)}
                >
                  {currentChapter?.url === ch.url && <View style={styles.modalAccentBar} />}
                  <Text style={[
                    styles.modalRowText,
                    currentChapter?.url === ch.url && styles.modalRowTextActive
                  ]} numberOfLines={1}>{ch.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setChapterModalVisible(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  info: {
    color: COLORS.textSecondary,
    marginTop: 3,
    fontSize: 13,
  },
  body: {
    flex: 1,
  },
  readerArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
  },
  pageListWebtoon: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignItems: 'stretch',
  },
  pageImage: {
    width: '100%',
    height: 480,
    marginBottom: 12,
    backgroundColor: '#111',
  },
  webtoonImage: {
    width: '100%',
    marginBottom: 0,
    backgroundColor: '#000',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: '100%',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  controlButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1,
    borderColor: COLORS.accentGlow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sliderWrap: {
    flex: 1,
    marginHorizontal: 12,
  },
  pageIndicator: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 2,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  chapterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.accentSoft,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.accentGlow,
  },
  chapterButtonText: {
    color: COLORS.accent,
    fontWeight: '700',
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 8,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
    letterSpacing: 0.3,
  },
  modalRow: {
    paddingVertical: 11,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
  },
  modalRowActive: {
    backgroundColor: COLORS.accentSoft,
  },
  modalAccentBar: {
    width: 3,
    height: 18,
    borderRadius: 1.5,
    backgroundColor: COLORS.accent,
    marginRight: 10,
  },
  modalRowText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    flex: 1,
  },
  modalRowTextActive: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  modalCloseButton: {
    alignSelf: 'flex-end',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.accentSoft,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.accentGlow,
  },
  modalCloseText: {
    color: COLORS.accent,
    fontWeight: '700',
    fontSize: 13,
  },
});

export default OfflineReader;
