import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import RNFS from 'react-native-fs';
import axios from 'axios';
import { SERVER_URL } from './config';
import {
  getProxiedImageUrl,
  readSearchHistory,
  addSearchQuery,
  DATA_PATH,
} from './utils';

const filePath = DATA_PATH;

interface SavedImage {
  id: string;
  url: string;
  caption: string;
  mangaUrl: string;
}

interface SearchResult {
  title: string;
  name?: string;
  coverUrl: string;
  url: string;
  source: string;
  latestChapter?: string;
}

const Search = ({ navigation }: any) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);

  // Load search history on mount
  useEffect(() => {
    readSearchHistory().then(setSearchHistory);
  }, []);

  // Group results by source
  const groupedResults = searchResults.reduce((acc: any, result: SearchResult) => {
    const source = result.source || 'Unknown';
    if (!acc[source]) {
      acc[source] = [];
    }
    acc[source].push(result);
    return acc;
  }, {});

  const searchManga = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      console.log('Searching for:', query);
      // Save to search history
      addSearchQuery(query).then(readSearchHistory).then(setSearchHistory);
      const response = await axios.get(`${SERVER_URL}/search`, {
        params: { query },
        timeout: 30000
      });
      
      if (response.data.success) {
        console.log('Setting search results:', response.data.results.length, 'items');
        setSearchResults(response.data.results);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchManga(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const addMangaFromSearch = async (result: any) => {
    try {
      // Read existing library
      const fileExists = await RNFS.exists(filePath);
      let savedImages: SavedImage[] = [];
      
      if (fileExists) {
        const fileContent = await RNFS.readFile(filePath, 'utf8');
        try {
          savedImages = JSON.parse(fileContent);
        } catch (e) {
          savedImages = [];
        }
      }

      // Check if already exists
      const exists = savedImages.some(item => item.mangaUrl === result.url);
      if (exists) {
        Alert.alert('Already in Library', 'This manga is already in your library.');
        return;
      }

      // Add new manga
      const newItem: SavedImage = {
        id: Date.now().toString(),
        url: result.coverUrl,
        caption: result.title || result.name,
        mangaUrl: result.url,
      };

      const updatedImages = [...savedImages, newItem];
      await RNFS.writeFile(filePath, JSON.stringify(updatedImages), 'utf8');
      
      Alert.alert('Success', `${result.title || result.name} added to library!`);
      navigation.goBack();
    } catch (error) {
      console.error('Error adding manga:', error);
      Alert.alert('Error', 'Failed to add manga to library.');
    }
  };

  const renderSearchResult = ({ item }: { item: any }) => {
    const proxiedUrl = getProxiedImageUrl(item.coverUrl, true);
    
    return (
      <TouchableOpacity
        style={styles.horizontalResultItem}
        onPress={() => addMangaFromSearch(item)}
      >
        <View style={styles.horizontalCoverContainer}>
          {item.coverUrl ? (
            <Image
              source={{ 
                uri: proxiedUrl,
                cache: 'reload'
              }}
              style={styles.horizontalCoverImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.noCover}>
              <Text style={styles.noCoverText}>?</Text>
            </View>
          )}
        </View>
        <View style={styles.horizontalResultInfo}>
          <Text style={styles.horizontalResultTitle} numberOfLines={2}>
            {item.title || item.name || 'Unknown'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSourceSection = (source: string, results: SearchResult[]) => {
    const isExpanded = expandedSource === source;
    const displayResults = isExpanded ? results : results.slice(0, 10);
    return (
      <View key={source} style={styles.sourceSection}>
        <View style={styles.sourceTitleContainer}>
          <Text style={styles.sourceTitle}>{source}</Text>
          {results.length > 10 && (
            <TouchableOpacity onPress={() => setExpandedSource(isExpanded ? null : source)}>
              <Text style={styles.showAllText}>{isExpanded ? 'Show less' : `Show all (${results.length})`}</Text>
            </TouchableOpacity>
          )}
        </View>
        <FlatList
          data={displayResults}
          horizontal
          keyExtractor={(item, index) => `${source}-${index}`}
          renderItem={renderSearchResult}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalList}
        />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search manga..."
          placeholderTextColor="#888"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoFocus={true}
        />
      </View>

      {/* Results */}
      <View style={styles.resultsContainer}>
        {searching ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6200ea" />
            <Text style={styles.loadingText}>Searching...</Text>
          </View>
        ) : searchQuery.length === 0 ? (
          <View style={styles.emptyContainer}>
            {searchHistory.length > 0 ? (
              <View style={styles.historyContainer}>
                <Text style={styles.historyTitle}>Recent Searches</Text>
                <View style={styles.historyChips}>
                  {searchHistory.map((query, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.historyChip}
                      onPress={() => setSearchQuery(query)}
                    >
                      <Text style={styles.historyChipText}>{query}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <Text style={styles.emptyText}>Enter manga name to search</Text>
            )}
          </View>
        ) : searchResults.length > 0 ? (
          <ScrollView style={styles.scrollView}>
            {Object.keys(groupedResults).map(source => 
              renderSourceSection(source, groupedResults[source])
            )}
          </ScrollView>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No results found</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  searchBar: {
    backgroundColor: '#1E1E1E',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2C',
  },
  searchInput: {
    backgroundColor: '#2C2C2C',
    color: '#FFFFFF',
    fontSize: 16,
    padding: 12,
    borderRadius: 8,
  },
  resultsContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#B0B0B0',
    fontSize: 16,
    marginTop: 15,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    color: '#B0B0B0',
    fontSize: 16,
    textAlign: 'center',
  },
  sourceSection: {
    marginBottom: 20,
  },
  sourceTitleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 10,
  },
  sourceTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  showAllText: {
    color: '#BB86FC',
    fontSize: 14,
  },
  horizontalList: {
    paddingLeft: 15,
    paddingRight: 5,
  },
  horizontalResultItem: {
    width: 120,
    marginRight: 10,
  },
  horizontalCoverContainer: {
    width: 120,
    height: 160,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#2C2C2C',
  },
  horizontalCoverImage: {
    width: '100%',
    height: '100%',
  },
  noCover: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#3C3C3C',
  },
  noCoverText: {
    color: '#666666',
    fontSize: 40,
  },
  horizontalResultInfo: {
    marginTop: 8,
  },
  horizontalResultTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  historyContainer: {
    width: '100%',
    paddingHorizontal: 15,
    paddingTop: 20,
  },
  historyTitle: {
    color: '#B0B0B0',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  historyChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  historyChip: {
    backgroundColor: '#2C2C2C',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  historyChipText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
});

export default Search;
