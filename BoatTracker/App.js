import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
  Modal,
  Animated,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { getDatabase, ref, onValue } from 'firebase/database';
import { initializeApp } from 'firebase/app';
import MapView, { Marker, Polyline } from 'react-native-maps';

// Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyBMfgwnwYfgxW57MMwKhkVTsQE0HqmEsW4',
  authDomain: 'boattracker-e296c.firebaseapp.com',
  projectId: 'boattracker-e296c',
  storageBucket: 'boattracker-e296c.appspot.com',
  messagingSenderId: '1025826293043',
  appId: '1:1025826293043:android:abcdef123456',
  databaseURL: 'https://boattracker-e296c-default-rtdb.firebaseio.com',
};

// Initialize Firebase
let app;
try {
  app = initializeApp(firebaseConfig);
  console.log('Firebase initialized successfully');
} catch (error) {
  console.warn('Firebase initialization:', error.code);
}



// Constants
const OFFLINE_THRESHOLD = 300; // 5 minutes in seconds

// Parse timestamp string "YYYY-MM-DD HH:MM:SS" to unix timestamp
const parseTimestamp = (timestampStr) => {
  if (!timestampStr) return 0;
  try {
    // Handle format: "2024-12-14 15:45:23"
    const date = new Date(timestampStr.replace(' ', 'T'));
    return Math.floor(date.getTime() / 1000);
  } catch (e) {
    return 0;
  }
};

// Format time ago
const formatTimeAgo = (seconds) => {
  if (isNaN(seconds) || seconds < 0) return 'Unknown';
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

// Get boat status - uses timestamp string from Firebase
const getBoatStatus = (latest) => {
  if (!latest) return 'offline';
  if (latest.sos === 1) return 'sos';
  
  const currentTime = Math.floor(Date.now() / 1000);
  // Parse the timestamp string to unix time
  const lastUpdate = parseTimestamp(latest.timestamp);
  const timeSinceUpdate = currentTime - lastUpdate;
  
  if (timeSinceUpdate > OFFLINE_THRESHOLD) return 'offline';
  return 'normal';
};

export default function App() {
  const [boats, setBoats] = useState({});
  const [selectedBoatId, setSelectedBoatId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  const mapRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for status dot
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.5,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Firebase connection
  useEffect(() => {
    if (!app) {
      setError('Firebase initialization failed');
      setLoading(false);
      return;
    }

    let timeoutId;
    let unsubscribe = null;

    try {
      const database = getDatabase(app);
      const boatsRef = ref(database, 'boats');

      timeoutId = setTimeout(() => {
        setLoading(false);
      }, 8000);

      unsubscribe = onValue(
        boatsRef,
        (snapshot) => {
          clearTimeout(timeoutId);
          if (snapshot.exists()) {
            setBoats(snapshot.val());
            setConnected(true);
          } else {
            setBoats({});
          }
          setLoading(false);
          setError(null);
        },
        (error) => {
          clearTimeout(timeoutId);
          setError(`Firebase Error: ${error.message}`);
          setLoading(false);
          setConnected(false);
        }
      );
    } catch (error) {
      clearTimeout(timeoutId);
      setError(`Setup Error: ${error.message}`);
      setLoading(false);
    }

    return () => {
      clearTimeout(timeoutId);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Get boat list
  const boatList = Object.entries(boats).map(([id, data]) => ({
    id,
    data,
    status: getBoatStatus(data?.latest),
  }));

  // Helper function to check if coordinates are valid (not 0,0 which means no GPS fix)
  const isValidCoordinate = (lat, lon) => {
    if (isNaN(lat) || isNaN(lon)) return false;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
    // Filter out 0,0 coordinates (no GPS fix)
    if (Math.abs(lat) < 0.0001 && Math.abs(lon) < 0.0001) return false;
    return true;
  };

  // Get boat markers with valid coordinates
  const boatMarkers = boatList
    .filter(({ data }) => {
      const lat = parseFloat(data?.latest?.latitude || data?.latest?.lat);
      const lon = parseFloat(data?.latest?.longitude || data?.latest?.lon);
      return isValidCoordinate(lat, lon);
    })
    .map(({ id, data, status }) => ({
      id,
      latitude: parseFloat(data.latest.latitude || data.latest.lat),
      longitude: parseFloat(data.latest.longitude || data.latest.lon),
      status,
      boatName: data.info?.owner || `Boat ${id}`,
      latest: data.latest,
      history: data.history,
    }));

  // Selected boat data
  const selectedBoat = selectedBoatId ? boats[selectedBoatId] : null;

  // Get history trail coordinates - handles flat history structure
  // History keys are like "1734164100_153" where first part is unix timestamp
  const getHistoryTrail = () => {
    if (!selectedBoat?.history || !showHistory) return [];
    
    const historyData = selectedBoat.history;
    const allPoints = [];
    
    // History is stored flat with keys like "unixTimestamp_counter"
    Object.entries(historyData).forEach(([key, point]) => {
      if (point && typeof point === 'object') {
        const lat = parseFloat(point.lat || point.latitude);
        const lon = parseFloat(point.lon || point.longitude);
        
        // Filter out 0,0 coordinates (no GPS fix)
        if (isValidCoordinate(lat, lon)) {
          // Extract unix timestamp from key (format: "1734164100_153")
          const keyTimestamp = parseInt(key.split('_')[0], 10);
          
          allPoints.push({
            latitude: lat,
            longitude: lon,
            timestamp: keyTimestamp || point.unix_timestamp || 0,
          });
        }
      }
    });

    // Sort by timestamp to create proper trail order
    return allPoints.sort((a, b) => a.timestamp - b.timestamp);
  };

  // Map region
  const getMapRegion = () => {
    if (boatMarkers.length === 0) {
      return {
        latitude: 14.5995,
        longitude: 120.9842,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      };
    }

    if (boatMarkers.length === 1) {
      return {
        latitude: boatMarkers[0].latitude,
        longitude: boatMarkers[0].longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }

    const lats = boatMarkers.map((m) => m.latitude);
    const lons = boatMarkers.map((m) => m.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.05),
      longitudeDelta: Math.max((maxLon - minLon) * 1.5, 0.05),
    };
  };

  // Center map on all boats
  const centerOnAllBoats = () => {
    if (mapRef.current && boatMarkers.length > 0) {
      mapRef.current.animateToRegion(getMapRegion(), 500);
    }
  };

  // Show history trail - close modal and zoom to fit trail
  const showHistoryTrail = () => {
    setShowHistory(true);
    setModalVisible(false);

    // Get history points for selected boat
    if (selectedBoat?.history && mapRef.current) {
      const historyPoints = [];
      Object.entries(selectedBoat.history).forEach(([key, point]) => {
        if (point && typeof point === 'object') {
          const lat = parseFloat(point.lat || point.latitude);
          const lon = parseFloat(point.lon || point.longitude);
          // Filter out 0,0 coordinates (no GPS fix)
          if (isValidCoordinate(lat, lon)) {
            historyPoints.push({ latitude: lat, longitude: lon });
          }
        }
      });

      // Also include current position (if valid, not 0,0)
      const currentLat = parseFloat(selectedBoat.latest?.lat || selectedBoat.latest?.latitude);
      const currentLon = parseFloat(selectedBoat.latest?.lon || selectedBoat.latest?.longitude);
      if (isValidCoordinate(currentLat, currentLon)) {
        historyPoints.push({ latitude: currentLat, longitude: currentLon });
      }

      if (historyPoints.length > 0) {
        // Calculate bounds
        const lats = historyPoints.map(p => p.latitude);
        const lons = historyPoints.map(p => p.longitude);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);

        // Add padding to the bounds
        const latPadding = Math.max((maxLat - minLat) * 0.3, 0.005);
        const lonPadding = Math.max((maxLon - minLon) * 0.3, 0.005);

        mapRef.current.animateToRegion({
          latitude: (minLat + maxLat) / 2,
          longitude: (minLon + maxLon) / 2,
          latitudeDelta: Math.max(maxLat - minLat + latPadding * 2, 0.01),
          longitudeDelta: Math.max(maxLon - minLon + lonPadding * 2, 0.01),
        }, 500);
      }
    }
  };

  // Open boat details modal
  const openBoatDetails = (boatId) => {
    setSelectedBoatId(boatId);
    setShowHistory(false);
    setModalVisible(true);

    const marker = boatMarkers.find((m) => m.id === boatId);
    if (marker && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: marker.latitude,
          longitude: marker.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        500
      );
    }
  };

  // Render boat card
  const renderBoatCard = ({ item }) => {
    const { id, data, status } = item;
    const latest = data?.latest;
    const boatName = data?.info?.owner || `Boat ${id}`;
    const lat = parseFloat(latest?.latitude || latest?.lat || 0);
    const lon = parseFloat(latest?.longitude || latest?.lon || 0);
    const currentTime = Math.floor(Date.now() / 1000);
    // Use parseTimestamp to handle the string timestamp format
    const lastUpdateTime = parseTimestamp(latest?.timestamp);
    const timeSinceUpdate = currentTime - lastUpdateTime;

    return (
      <TouchableOpacity
        style={[
          styles.boatCard,
          status === 'sos' && styles.boatCardSOS,
          status === 'offline' && styles.boatCardOffline,
          selectedBoatId === id && styles.boatCardSelected,
        ]}
        onPress={() => openBoatDetails(id)}
      >
        <View style={styles.boatCardHeader}>
          <Text style={styles.boatName}>{boatName}</Text>
          <View style={[styles.statusBadge, styles[`statusBadge_${status}`]]}>
            <Text style={styles.statusBadgeText}>
              {status === 'sos' ? 'SOS' : status === 'offline' ? 'OFFLINE' : 'NORMAL'}
            </Text>
          </View>
        </View>
        <Text style={styles.boatInfo}>ID: {id}</Text>
        <Text style={styles.boatInfo}>
          {lat.toFixed(6)}°N, {lon.toFixed(6)}°E
        </Text>
        <Text style={styles.boatInfo}>Updated: {formatTimeAgo(timeSinceUpdate)}</Text>
        {latest?.rssi && (
          <Text style={styles.boatInfo}>
            Signal: {latest.rssi} dBm {latest.snr ? `(SNR: ${latest.snr} dB)` : ''}
          </Text>
        )}
        {(latest?.rain_mm_hr !== undefined || latest?.wind_speed_ms !== undefined) && (
          <Text style={styles.boatInfo}>
            🌧️ {latest.rain_mm_hr ?? 'N/A'} mm/hr  💨 {latest.wind_speed_ms ?? 'N/A'} m/s
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const historyTrail = getHistoryTrail();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f2027" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🚤 Boat Tracker</Text>
        <View style={styles.statusIndicator}>
          <Animated.View
            style={[
              styles.statusDot,
              connected ? styles.statusDotConnected : styles.statusDotDisconnected,
              { opacity: pulseAnim },
            ]}
          />
          <Text style={styles.statusText}>{connected ? 'Connected' : 'Connecting...'}</Text>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.mainContainer}>
        {/* Map */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={getMapRegion()}
            showsUserLocation={true}
            showsMyLocationButton={false}
            mapType="standard"
          >
            {/* History Trail Line */}
            {showHistory && historyTrail.length > 1 && (
              <Polyline
                coordinates={historyTrail}
                strokeColor="#4a90e2"
                strokeWidth={3}
                lineDashPattern={[10, 10]}
              />
            )}

            {/* History Trail Point Markers */}
            {showHistory && historyTrail.map((point, index) => (
              <Marker
                key={`history-${index}`}
                coordinate={{ latitude: point.latitude, longitude: point.longitude }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={styles.historyDot} />
              </Marker>
            ))}

            {/* Boat Markers - Custom boat icon design */}
            {boatMarkers.map((marker) => (
              <Marker
                key={`boat-${marker.id}-${marker.status}`}
                identifier={`boat-${marker.id}`}
                coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
                onPress={() => openBoatDetails(marker.id)}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    backgroundColor: marker.status === 'sos' ? '#f44336' : marker.status === 'offline' ? '#888888' : '#4caf50',
                    borderWidth: 3,
                    borderColor: '#fff',
                    borderRadius: 18,
                    justifyContent: 'center',
                    alignItems: 'center',
                    elevation: 5,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.3,
                    shadowRadius: 3,
                  }}
                >
                  <Text style={{ fontSize: 16 }}>⛵</Text>
                </View>
              </Marker>
            ))}
          </MapView>

          {/* Map Controls */}
          <View style={styles.mapControls}>
            <TouchableOpacity style={styles.mapControlBtn} onPress={centerOnAllBoats}>
              <Text style={styles.mapControlIcon}>⊕</Text>
            </TouchableOpacity>
            {showHistory && (
              <TouchableOpacity 
                style={[styles.mapControlBtn, styles.mapControlBtnActive]} 
                onPress={() => setShowHistory(false)}
              >
                <Text style={styles.mapControlIcon}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <Text style={styles.legendTitle}>Legend</Text>
            <View style={styles.legendItem}>
              <View style={[styles.legendMarker, { backgroundColor: '#4caf50' }]} />
              <Text style={styles.legendText}>Normal</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendMarker, { backgroundColor: '#f44336' }]} />
              <Text style={styles.legendText}>SOS Alert</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendMarker, { backgroundColor: '#888' }]} />
              <Text style={styles.legendText}>Offline (5+ min)</Text>
            </View>
            {showHistory && (
              <View style={styles.legendItem}>
                <View style={[styles.legendLine, { backgroundColor: '#4a90e2' }]} />
                <Text style={styles.legendText}>History Trail</Text>
              </View>
            )}
          </View>
        </View>

        {/* Sidebar - Boat List */}
        <View style={styles.sidebar}>
          <View style={styles.sidebarHeader}>
            <Text style={styles.sidebarTitle}>Active Boats</Text>
            <Text style={styles.boatCount}>{boatMarkers.length} tracked</Text>
          </View>
          
          {loading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color="#4a90e2" />
              <Text style={styles.loadingText}>Loading boats...</Text>
            </View>
          ) : error ? (
            <View style={styles.centerContent}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          ) : boatList.length === 0 ? (
            <View style={styles.centerContent}>
              <Text style={styles.emptyText}>No boats available</Text>
              <Text style={styles.emptySubtext}>Waiting for data...</Text>
            </View>
          ) : (
            <FlatList
              data={boatList}
              keyExtractor={(item) => item.id}
              renderItem={renderBoatCard}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.boatListContent}
            />
          )}
        </View>
      </View>

      {/* Boat Details Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setModalVisible(false)}>
              <Text style={styles.modalCloseText}>×</Text>
            </TouchableOpacity>

            {selectedBoat && (
              <>
                <Text style={styles.modalTitle}>
                  {selectedBoat.info?.owner || `Boat ${selectedBoatId}`}
                </Text>

                <ScrollView 
                  style={styles.modalScroll}
                  showsVerticalScrollIndicator={true}
                  contentContainerStyle={styles.modalScrollContent}
                >
                  <View style={styles.modalDetails}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Device ID:</Text>
                      <Text style={styles.detailValue}>{selectedBoatId}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Position:</Text>
                      <Text style={styles.detailValue}>
                        {parseFloat(selectedBoat.latest?.latitude || selectedBoat.latest?.lat || 0).toFixed(6)}°N,{' '}
                        {parseFloat(selectedBoat.latest?.longitude || selectedBoat.latest?.lon || 0).toFixed(6)}°E
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Last Update:</Text>
                      <Text style={styles.detailValue}>
                        {selectedBoat.latest?.timestamp || 
                        (selectedBoat.latest?.unix_timestamp 
                          ? new Date(selectedBoat.latest.unix_timestamp * 1000).toLocaleString()
                          : 'N/A')}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Status:</Text>
                      <Text
                        style={[
                          styles.detailValue,
                          selectedBoat.latest?.sos === 1 ? styles.sosText : styles.normalText,
                        ]}
                      >
                        {selectedBoat.latest?.sos === 1 ? '🔴 SOS ALERT!' : '🟢 Normal'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Signal (RSSI):</Text>
                      <Text style={styles.detailValue}>{selectedBoat.latest?.rssi || 'N/A'} dBm</Text>
                    </View>
                    {selectedBoat.latest?.snr !== undefined && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Signal Quality (SNR):</Text>
                        <Text style={styles.detailValue}>{selectedBoat.latest.snr} dB</Text>
                      </View>
                    )}
                    {selectedBoat.latest?.temperature !== undefined && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Temperature:</Text>
                        <Text style={styles.detailValue}>{selectedBoat.latest.temperature}°C</Text>
                      </View>
                    )}
                    {selectedBoat.latest?.humidity !== undefined && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Humidity:</Text>
                        <Text style={styles.detailValue}>{selectedBoat.latest.humidity}%</Text>
                      </View>
                    )}
                    {selectedBoat.latest?.rain_mm_hr !== undefined && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Rain Rate:</Text>
                        <Text style={styles.detailValue}>{selectedBoat.latest.rain_mm_hr} mm/hr</Text>
                      </View>
                    )}
                    {selectedBoat.latest?.wind_speed_ms !== undefined && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Wind Speed:</Text>
                        <Text style={styles.detailValue}>{selectedBoat.latest.wind_speed_ms} m/s</Text>
                      </View>
                    )}
                    {selectedBoat.latest?.counter !== undefined && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Message Count:</Text>
                        <Text style={styles.detailValue}>{selectedBoat.latest.counter}</Text>
                      </View>
                    )}
                  </View>
                </ScrollView>

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.btnPrimary}
                    onPress={showHistoryTrail}
                  >
                    <Text style={styles.btnText}>📍 Show History Trail</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f2027',
  },
  // Header
  header: {
    backgroundColor: 'rgba(15, 32, 39, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#4a90e2',
  },
  headerTitle: {
    color: '#4a90e2',
    fontSize: 20,
    fontWeight: '600',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusDotConnected: {
    backgroundColor: '#4caf50',
  },
  statusDotDisconnected: {
    backgroundColor: '#888',
  },
  statusText: {
    color: '#e0e0e0',
    fontSize: 12,
  },
  // Main Container
  mainContainer: {
    flex: 1,
    flexDirection: 'column',
  },
  // Map
  mapContainer: {
    flex: 1.3,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  mapControls: {
    position: 'absolute',
    top: 10,
    right: 10,
    gap: 10,
  },
  mapControlBtn: {
    width: 44,
    height: 44,
    backgroundColor: 'rgba(15, 32, 39, 0.9)',
    borderWidth: 2,
    borderColor: '#4a90e2',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  mapControlBtnActive: {
    backgroundColor: 'rgba(74, 144, 226, 0.7)',
  },
  mapControlIcon: {
    color: '#fff',
    fontSize: 20,
  },
  // Legend
  legend: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(15, 32, 39, 0.95)',
    borderWidth: 1,
    borderColor: '#4a90e2',
    borderRadius: 8,
    padding: 10,
  },
  legendTitle: {
    color: '#4a90e2',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  legendMarker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#fff',
    marginRight: 8,
  },
  legendLine: {
    width: 20,
    height: 4,
    borderRadius: 2,
    marginRight: 8,
  },
  legendZone: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: '#fff',
    marginRight: 8,
  },
  legendText: {
    color: '#e0e0e0',
    fontSize: 11,
  },
  // Boat Markers - Custom design matching web app
  boatMarker: {
    width: 36,
    height: 36,
    backgroundColor: '#4caf50',
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  boatMarkerSOS: {
    backgroundColor: '#f44336',
  },
  boatMarkerOffline: {
    backgroundColor: '#888888',
  },
  boatMarkerIcon: {
    fontSize: 18,
    color: '#fff',
  },
  // History trail dot
  historyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4a90e2',
    borderWidth: 2,
    borderColor: '#fff',
  },
  // Callout
  calloutContainer: {
    backgroundColor: 'rgba(32, 58, 67, 0.98)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#4a90e2',
    minWidth: 160,
  },
  calloutTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  calloutStatus: {
    fontSize: 13,
    marginBottom: 4,
  },
  calloutCoords: {
    color: '#b0b0b0',
    fontSize: 11,
  },
  // Sidebar
  sidebar: {
    flex: 0.7,
    backgroundColor: 'rgba(32, 58, 67, 0.95)',
    borderTopWidth: 2,
    borderTopColor: '#4a90e2',
  },
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#4a90e2',
  },
  sidebarTitle: {
    color: '#4a90e2',
    fontSize: 16,
    fontWeight: '600',
  },
  boatCount: {
    color: '#b0b0b0',
    fontSize: 12,
  },
  boatListContent: {
    padding: 10,
  },
  // Boat Cards
  boatCard: {
    backgroundColor: 'rgba(44, 83, 100, 0.6)',
    borderWidth: 2,
    borderColor: '#4a90e2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  boatCardSOS: {
    borderColor: '#f44336',
    backgroundColor: 'rgba(244, 67, 54, 0.2)',
  },
  boatCardOffline: {
    opacity: 0.6,
    borderColor: '#888',
  },
  boatCardSelected: {
    backgroundColor: 'rgba(74, 144, 226, 0.3)',
    borderColor: '#fff',
  },
  boatCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  boatName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusBadge_normal: {
    backgroundColor: '#4caf50',
  },
  statusBadge_sos: {
    backgroundColor: '#f44336',
  },
  statusBadge_offline: {
    backgroundColor: '#888',
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  boatInfo: {
    color: '#b0b0b0',
    fontSize: 12,
    marginTop: 3,
  },
  // Center content
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#b0b0b0',
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: '#f44336',
    fontSize: 14,
    textAlign: 'center',
  },
  emptyText: {
    color: '#b0b0b0',
    fontSize: 16,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'rgba(32, 58, 67, 0.98)',
    borderWidth: 2,
    borderColor: '#4a90e2',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalClose: {
    position: 'absolute',
    top: 8,
    right: 12,
    zIndex: 1,
    padding: 4,
  },
  modalCloseText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '300',
  },
  modalTitle: {
    color: '#4a90e2',
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 16,
    marginRight: 30,
  },
  modalScroll: {
    maxHeight: 300,
  },
  modalScrollContent: {
    paddingRight: 10,
  },
  modalDetails: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(74, 144, 226, 0.3)',
  },
  detailLabel: {
    color: '#4a90e2',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  detailValue: {
    color: '#e0e0e0',
    fontSize: 13,
    flex: 1.2,
    textAlign: 'right',
  },
  sosText: {
    color: '#f44336',
    fontWeight: '600',
  },
  normalText: {
    color: '#4caf50',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: '#4a90e2',
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: '#666',
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Alert Toast
  alertToast: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(244, 67, 54, 0.95)',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f44336',
  },
  alertText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
