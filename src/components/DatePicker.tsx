import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Platform } from 'react-native';

interface DateItem {
  day: string;
  num: number;
  active?: boolean;
}

export default function DatePicker() {
  const dates: DateItem[] = [
    { day: 'Sun', num: 11 },
    { day: 'Mon', num: 12 },
    { day: 'Tue', num: 13 },
    { day: 'Wed', num: 14, active: true },
    { day: 'Thu', num: 15 },
    { day: 'Fri', num: 16 },
    { day: 'Sat', num: 17 },
  ];

  const [selectedNum, setSelectedNum] = useState<number>(14);

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {dates.map((item, index) => {
          const isSelected = item.num === selectedNum;
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.dateCard,
                isSelected && styles.dateCardActive,
              ]}
              onPress={() => setSelectedNum(item.num)}
            >
              {isSelected && <View style={styles.dotIndicator} />}
              <Text
                style={[
                  styles.dayText,
                  isSelected && styles.dayTextActive,
                ]}
              >
                {item.day}
              </Text>
              <Text
                style={[
                  styles.numText,
                  isSelected && styles.numTextActive,
                ]}
              >
                {item.num}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 20,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  dateCard: {
    width: 56,
    height: 76,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#CCC',
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  dateCardActive: {
    backgroundColor: '#1E1E4F',
    borderColor: '#1E1E4F',
    elevation: 3,
    ...Platform.select({
      ios: {
        shadowColor: '#1E1E4F',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      web: {
        boxShadow: '0px 4px 6px rgba(30, 30, 79, 0.3)',
      },
    }),
  },
  dotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFF',
    position: 'absolute',
    top: 8,
  },
  dayText: {
    fontSize: 10,
    color: '#888',
    marginBottom: 4,
    textTransform: 'capitalize',
    fontFamily: 'Poppins_400Regular',
  },
  dayTextActive: {
    color: '#DDD',
    fontWeight: '500',
    marginTop: 6,
    fontFamily: 'Poppins_600SemiBold',
  },
  numText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    fontFamily: 'Poppins_700Bold',
  },
  numTextActive: {
    color: '#FFF',
  },
});
