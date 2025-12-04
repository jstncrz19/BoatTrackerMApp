import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, ActivityIndicator, TouchableOpacity, FlatList, Dimensions } from 'react-native';
import { getDatabase, ref, onValue } from 'firebase/database';
import { initializeApp } from 'firebase/app';
import MapView, { Marker, Callout } from 'react-native-maps';

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

export default function App() {
  const [boats, setBoats] = useState({});
  const [selectedBoatId, setSelectedBoatId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log('App mounted, attempting Firebase connection...');
    
    if (!app) {
      console.error('Firebase app not initialized');
      setError('Firebase initialization failed');
      setLoading(false);
      return;
    }

    let timeoutId;
    let unsubscribe = null;

    try {
      const database = getDatabase(app);
      console.log('Database connection created');
      
      const boatsRef = ref(database, 'boats');

      // Set timeout for initial load
      timeoutId = setTimeout(() => {
        console.warn('Firebase connection timeout - showing empty state');
        setLoading(false);
      }, 8000); // 8 second timeout

      console.log('Listening for boats data...');
      
      // Listen for real-time updates
      unsubscribe = onValue(
        boatsRef,
        (snapshot) => {
          clearTimeout(timeoutId);
          console.log('Firebase snapshot received');
          if (snapshot.exists()) {
            const data = snapshot.val();
            console.log('Boats data:', data);
            setBoats(data);
          } else {
            console.log('No boats data found in Firebase');
            setBoats({});
          }
          setLoading(false);
          setError(null);
        },
        (error) => {
          clearTimeout(timeoutId);
          console.error('Firebase error:', error.code, error.message);
          setError(`Firebase Error: ${error.message}`);
          setLoading(false);
          setBoats({});
        }
      );
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Error setting up Firebase listener:', error);
      setError(`Setup Error: ${error.message}`);
      setLoading(false);
    }

    return () => {
      clearTimeout(timeoutId);
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const selectedBoat = selectedBoatId && boats[selectedBoatId] ? boats[selectedBoatId] : null;
  const boatLatest = selectedBoat?.latest || null;

  const boatList = Object.entries(boats).map(([id, data]) => ({
    id,
    data,
  }));

  // Get all boat markers with valid coordinates
  const boatMarkers = boatList
    .filter(({ data }) => {
      const lat = parseFloat(data?.latest?.lat);
      const lon = parseFloat(data?.latest?.lon);
      // Valid coordinate ranges
      return !isNaN(lat) && !isNaN(lon) && 
             lat >= -90 && lat <= 90 && 
             lon >= -180 && lon <= 180;
    })
    .map(({ id, data }) => ({
      id,
      latitude: parseFloat(data.latest.lat),
      longitude: parseFloat(data.latest.lon),
      sos: data.latest.sos === 1,
      timestamp: data.latest.timestamp,
      temperature: data.latest.temperature,
      humidity: data.latest.humidity,
    }));

  // Calculate map region to fit all boats
  const getMapRegion = () => {
    if (boatMarkers.length === 0) {
      // Default to Philippines if no boats
      return {
        latitude: 15.22,
        longitude: 120.58,
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

    const lats = boatMarkers.map(m => m.latitude);
    const lons = boatMarkers.map(m => m.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const latDelta = Math.max((maxLat - minLat) * 1.5, 0.05);
    const lonDelta = Math.max((maxLon - minLon) * 1.5, 0.05);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lonDelta,
    };
  };

  return (
    <View style={styles.container}>
      {/* Map View - Top Section */}
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          region={getMapRegion()}
          showsUserLocation={true}
          showsMyLocationButton={true}
        >
          {boatMarkers.map((marker) => (
            <Marker
              key={marker.id}
              coordinate={{
                latitude: marker.latitude,
                longitude: marker.longitude,
              }}
              pinColor={marker.sos ? '#FF0000' : '#0066cc'}
              onPress={() => setSelectedBoatId(marker.id)}
            >
              <Callout>
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle}>Boat {marker.id}</Text>
                  <Text style={styles.calloutText}>
                    📍 {marker.latitude.toFixed(6)}, {marker.longitude.toFixed(6)}
                  </Text>
                  <Text style={styles.calloutText}>🌡️ {marker.temperature}°C</Text>
                  <Text style={styles.calloutText}>💧 {marker.humidity}%</Text>
                  <Text style={styles.calloutText}>⏰ {marker.timestamp}</Text>
                  {marker.sos && (
                    <Text style={styles.sosCallout}>🆘 SOS ACTIVE!</Text>
                  )}
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>
        {boatMarkers.length === 0 && !loading && (
          <View style={styles.mapOverlay}>
            <Text style={styles.mapOverlayText}>No boats with valid coordinates</Text>
          </View>
        )}
        <View style={styles.mapLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#0066cc' }]} />
            <Text style={styles.legendText}>Normal</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#FF0000' }]} />
            <Text style={styles.legendText}>SOS</Text>
          </View>
          <Text style={styles.legendCount}>{boatMarkers.length} boat(s)</Text>
        </View>
      </View>

      {/* Bottom Section - Boat List and Details */}
      <View style={styles.bottomContainer}>
        {/* Left Panel - Boat List */}
        <View style={styles.listContainer}>
          <Text style={styles.panelTitle}>Boats</Text>
        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#0066cc" />
            <Text style={styles.loadingText}>Loading boats...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerContent}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
            <Text style={styles.subText}>Check your internet connection</Text>
          </View>
        ) : boatList.length === 0 ? (
          <View style={styles.centerContent}>
            <Text style={styles.emptyText}>No boats available</Text>
            <Text style={styles.subText}>Waiting for data from Firebase...</Text>
          </View>
        ) : (
          <FlatList
            data={boatList}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.boatItem,
                  selectedBoatId === item.id && styles.boatItemSelected,
                ]}
                onPress={() => setSelectedBoatId(item.id)}
              >
                <Text style={styles.boatItemTitle}>Boat {item.id}</Text>
                <Text style={styles.boatItemSubtitle}>
                  {item.data.latest?.timestamp || 'No data'}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      {/* Right Panel - Details */}
      <View style={styles.detailsContainer}>
        {selectedBoat && boatLatest ? (
          <ScrollView style={styles.detailsContent}>
            <Text style={styles.panelTitle}>Boat Details</Text>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>🆔 Boat ID</Text>
              <Text style={styles.detailValue}>{selectedBoatId}</Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>📍 Latitude</Text>
              <Text style={styles.detailValue}>
                {parseFloat(boatLatest.lat)?.toFixed(6) || 'N/A'}
              </Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>📍 Longitude</Text>
              <Text style={styles.detailValue}>
                {parseFloat(boatLatest.lon)?.toFixed(6) || 'N/A'}
              </Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>🌡️ Temperature</Text>
              <Text style={styles.detailValue}>
                {parseFloat(boatLatest.temperature)?.toFixed(2) || 'N/A'}°C
              </Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>💧 Humidity</Text>
              <Text style={styles.detailValue}>
                {parseFloat(boatLatest.humidity)?.toFixed(2) || 'N/A'}%
              </Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>⏰ Timestamp</Text>
              <Text style={styles.detailValue}>{boatLatest.timestamp || 'N/A'}</Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>📊 Counter</Text>
              <Text style={styles.detailValue}>{boatLatest.counter || 'N/A'}</Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>🆘 SOS Status</Text>
              <Text
                style={[
                  styles.detailValue,
                  boatLatest.sos === 1 ? styles.sosActive : styles.sosInactive,
                ]}
              >
                {boatLatest.sos === 1 ? '🔴 ACTIVE' : '🟢 OK'}
              </Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>📡 RSSI</Text>
              <Text style={styles.detailValue}>{boatLatest.rssi || 'N/A'} dBm</Text>
            </View>
          </ScrollView>
        ) : (
          <View style={styles.centerContent}>
            <Text style={styles.emptyText}>Select a boat to view details</Text>
          </View>
        )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  mapOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -100 }, { translateY: -20 }],
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 16,
    borderRadius: 8,
  },
  mapOverlayText: {
    color: '#fff',
    fontSize: 14,
  },
  mapLegend: {
    position: 'absolute',
    top: 50,
    right: 10,
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    fontSize: 12,
    color: '#333',
  },
  legendCount: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
    fontWeight: '600',
  },
  callout: {
    padding: 8,
    minWidth: 150,
  },
  calloutTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  calloutText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  sosCallout: {
    fontSize: 12,
    color: '#FF0000',
    fontWeight: 'bold',
    marginTop: 4,
  },
  bottomContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  listContainer: {
    flex: 1,
    backgroundColor: '#f0f4f8',
    borderRightWidth: 1,
    borderRightColor: '#ddd',
  },
  detailsContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  panelTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#d32f2f',
    textAlign: 'center',
    fontWeight: '600',
  },
  subText: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  boatItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
    marginHorizontal: 8,
    marginVertical: 4,
    borderRadius: 8,
  },
  boatItemSelected: {
    backgroundColor: '#e3f2fd',
    borderLeftWidth: 4,
    borderLeftColor: '#0066cc',
  },
  boatItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  boatItemSubtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  detailsContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  detailSection: {
    marginTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  sosActive: {
    color: '#d32f2f',
    fontWeight: 'bold',
    fontSize: 18,
  },
  sosInactive: {
    color: '#388e3c',
    fontWeight: 'bold',
    fontSize: 18,
  },
});
