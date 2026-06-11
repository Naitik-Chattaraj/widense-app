import React from 'react';
import { StyleSheet, Text, View, SafeAreaView, FlatList, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface HistoryItem {
  id: string;
  date: string;
  task: string;
  duration: string;
}

export default function HistoryScreen() {
  const historyData: HistoryItem[] = [
    { id: '1', date: 'May 16, 2026', task: 'Visited F2 Rose Petals', duration: '45 mins' },
    { id: '2', date: 'May 15, 2026', task: 'Visited Sejuti Kalpataru', duration: '1 hr 10 mins' },
    { id: '3', date: 'May 14, 2026', task: 'Visited Adityalay', duration: '30 mins' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Activity History</Text>
      </View>
      <FlatList
        data={historyData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardIcon}>
              <Ionicons name="time-outline" size={24} color="#f5474c" />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{item.task}</Text>
              <Text style={styles.cardDate}>{item.date}</Text>
            </View>
            <Text style={styles.duration}>{item.duration}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderColor: '#F0F0F0',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
  },
  listContent: {
    padding: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#FFEAEA',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#f5474c',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
      },
      web: {
        boxShadow: '0px 4px 6px rgba(245, 71, 76, 0.05)',
      },
    }),
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFEAEA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardText: {
    flex: 1,
    marginLeft: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    fontFamily: 'Poppins_700Bold',
  },
  cardDate: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
    fontFamily: 'Poppins_400Regular',
  },
  duration: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f5474c',
    fontFamily: 'Poppins_600SemiBold',
  },
});
