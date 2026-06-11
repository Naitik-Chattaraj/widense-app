import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabaseService, Project, UserDay } from '../services/supabaseService';

const { width } = Dimensions.get('window');
const wtLogo = require('../../assets/wt-logo.png');

interface CalendarScreenProps {
  user: any;
  navigation: any;
}

export default function CalendarScreen({ user, navigation }: CalendarScreenProps) {
  const displayName = user?.name || 'Worker';

  // Date and month navigation states
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Database lists
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [dayProjects, setDayProjects] = useState<Project[]>([]);
  const [activeShift, setActiveShift] = useState<UserDay | null>(null);
  const [loading, setLoading] = useState(true);

  // Load projects and current shift state
  const loadCalendarData = async () => {
    try {
      const projs = await supabaseService.getProjects(user.id);
      setAllProjects(projs);

      const shift = await supabaseService.getTodayUserDay(user.id);
      setActiveShift(shift);
    } catch (e) {
      console.error('[CalendarScreen] Error loading data:', e);
    } finally {
      setLoading(false);
    }
  };

  // Run on mount and refresh whenever user focuses the screen
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadCalendarData();
    }, [user.id])
  );

  // Local date formatting helper to avoid UTC timezone bugs
  const getLocalDateString = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Filter projects for the selected calendar date
  useEffect(() => {
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const selectedDayName = weekdays[selectedDate.getDay()];
    const selectedIsoDate = getLocalDateString(selectedDate);

    const filtered = allProjects.filter(
      (p) => p.day === selectedDayName || p.day === selectedIsoDate
    );
    setDayProjects(filtered);
  }, [selectedDate, allProjects]);

  // Handle setting a project as active destination for navigation
  const handleSelectDestination = async (project: Project) => {
    // Check if worker has checked in for the day (active shift)
    if (!activeShift || activeShift.ended_at) {
      Alert.alert(
        'Shift Inactive',
        "Please press 'Start Your Day' on the Home screen to clock in before activating navigation to a project site.",
        [{ text: 'Go to Home', onPress: () => navigation.navigate('HomeTab') }, { text: 'Cancel', style: 'cancel' }]
      );
      return;
    }

    try {
      // Set selected project as active navigation destination
      await AsyncStorage.setItem(`active_project_${user.id}`, JSON.stringify(project));
      Alert.alert('Destination Selected', `Navigation set to: ${project.name}`);
      navigation.navigate('ActivitiesTab');
    } catch (e) {
      console.error('[CalendarScreen] Error storing active project:', e);
    }
  };

  // Month navigation helpers
  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  // Calendar Grid Calculation
  const getDaysInMonth = (month: Date) => {
    const year = month.getFullYear();
    const monthIdx = month.getMonth();

    const firstDay = new Date(year, monthIdx, 1);
    const startDayOfWeek = firstDay.getDay(); // 0 (Sun) - 6 (Sat)
    const totalDays = new Date(year, monthIdx + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, monthIdx, 0).getDate();

    const cells = [];

    // Pad starting empty days from previous month
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      cells.push({
        date: new Date(year, monthIdx - 1, prevMonthTotalDays - i),
        isCurrentMonth: false,
      });
    }

    // Add days of current month
    for (let i = 1; i <= totalDays; i++) {
      cells.push({
        date: new Date(year, monthIdx, i),
        isCurrentMonth: true,
      });
    }

    // Pad trailing days to complete full weeks
    const totalCells = cells.length;
    const paddingNeeded = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= paddingNeeded; i++) {
      cells.push({
        date: new Date(year, monthIdx + 1, i),
        isCurrentMonth: false,
      });
    }

    return cells;
  };

  // Helper to check if a specific date has any assigned projects
  const dateHasProjects = (date: Date) => {
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dStr = weekdays[date.getDay()];
    const isoStr = getLocalDateString(date);
    return allProjects.some((p) => p.day === dStr || p.day === isoStr);
  };

  const calendarCells = getDaysInMonth(currentMonth);
  const monthsList = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f5474c" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Navbar */}
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('HomeTab')}>
          <Ionicons name="notifications-outline" size={26} color="#f5474c" />
        </TouchableOpacity>

        <Image source={wtLogo} style={styles.logoImage} resizeMode="contain" />

        <TouchableOpacity style={styles.profileContainer}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarTxt}>{displayName[0].toUpperCase()}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Month Selector Controls */}
        <View style={styles.monthSelectorRow}>
          <Text style={styles.monthTitle}>
            {monthsList[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </Text>
          <View style={styles.chevronControls}>
            <TouchableOpacity style={styles.chevronBtn} onPress={handlePrevMonth}>
              <Ionicons name="chevron-back" size={20} color="#1b1464" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.chevronBtn} onPress={handleNextMonth}>
              <Ionicons name="chevron-forward" size={20} color="#1b1464" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Days Header */}
        <View style={styles.daysHeaderRow}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
            <Text key={index} style={styles.dayOfWeekText}>{day}</Text>
          ))}
        </View>

        {/* Calendar Grid */}
        <View style={styles.gridContainer}>
          {calendarCells.map((cell, idx) => {
            const isSelected = cell.date.toDateString() === selectedDate.toDateString();
            const isToday = cell.date.toDateString() === new Date().toDateString();
            const hasTask = dateHasProjects(cell.date);

            return (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.gridCell,
                  !cell.isCurrentMonth && styles.gridCellMuted,
                  isSelected && styles.gridCellSelected,
                  isToday && !isSelected && styles.gridCellToday,
                ]}
                onPress={() => setSelectedDate(cell.date)}
              >
                <Text
                  style={[
                    styles.dateNumText,
                    !cell.isCurrentMonth && styles.dateNumMutedText,
                    isSelected && styles.dateNumSelectedText,
                    isToday && !isSelected && styles.dateNumTodayText,
                  ]}
                >
                  {cell.date.getDate()}
                </Text>
                
                {/* Indicator dot if projects exist on this date */}
                {hasTask && (
                  <View style={[styles.taskIndicatorDot, isSelected && styles.taskIndicatorDotSelected]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Selected Day Agenda List */}
        <View style={styles.agendaSection}>
          <Text style={styles.sectionTitle}>
            Schedule for {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </Text>

          {dayProjects.length === 0 ? (
            <View style={styles.emptyAgendaCard}>
              <Ionicons name="calendar-clear-outline" size={36} color="#A0AEC0" style={{ marginBottom: 12 }} />
              <Text style={styles.emptyAgendaText}>No projects assigned for this date.</Text>
            </View>
          ) : (
            dayProjects.map((project) => (
              <View key={project.id} style={styles.projectCard}>
                <View style={styles.projectCardHeader}>
                  <View style={styles.siteIndicatorBlock}>
                    <Ionicons name="business" size={16} color="#1b1464" />
                    <Text style={styles.siteTypeLabel}>SOLAR SITE</Text>
                  </View>
                  
                  {/* Status Badge */}
                  <View style={[styles.statusBadge, styles[`statusBadge_${project.status}`]]}>
                    <Text style={styles.statusBadgeText}>{project.status.toUpperCase()}</Text>
                  </View>
                </View>

                <Text style={styles.projectName}>{project.name}</Text>
                <Text style={styles.projectAddress}>{project.location_name}</Text>

                <View style={styles.cardDivider} />

                <View style={styles.actionRow}>
                  {project.require_media ? (
                    <View style={styles.mediaTag}>
                      <Ionicons name="camera-outline" size={14} color="#f5474c" style={{ marginRight: 4 }} />
                      <Text style={styles.mediaTagText}>Media Required</Text>
                    </View>
                  ) : (
                    <View style={styles.mediaTagMuted}>
                      <Ionicons name="camera-outline" size={14} color="#718096" style={{ marginRight: 4 }} />
                      <Text style={styles.mediaTagMutedText}>No Media Req</Text>
                    </View>
                  )}

                  {/* Guide Navigation trigger */}
                  <TouchableOpacity
                    style={styles.navigateBtn}
                    onPress={() => handleSelectDestination(project)}
                  >
                    <Ionicons name="navigate" size={16} color="#FFF" style={{ marginRight: 6 }} />
                    <Text style={styles.navigateBtnText}>Select & Navigate</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#F0F0F0',
    backgroundColor: '#FFF',
  },
  logoImage: {
    width: 90,
    height: 40,
  },
  iconButton: {
    padding: 6,
  },
  profileContainer: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1b1464',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarTxt: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'Poppins_700Bold',
  },
  scrollContent: {
    paddingBottom: 110, // accounts for floating absolute tab bar
  },
  monthSelectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 20,
    marginBottom: 16,
  },
  monthTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
  },
  chevronControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chevronBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  daysHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  dayOfWeekText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#f5474c', // Coral Red tech
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.5,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  gridCell: {
    width: `${100 / 7}%`,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginVertical: 2,
    borderRadius: 8,
  },
  gridCellMuted: {
    opacity: 0.35,
  },
  gridCellSelected: {
    backgroundColor: '#1b1464', // Deep Indigo active selection
  },
  gridCellToday: {
    borderWidth: 1.5,
    borderColor: '#f5474c', // Coral Red boundary for today
  },
  dateNumText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2D3748',
    fontFamily: 'Roboto_500Medium',
  },
  dateNumMutedText: {
    color: '#718096',
  },
  dateNumSelectedText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  dateNumTodayText: {
    color: '#f5474c',
    fontWeight: 'bold',
  },
  taskIndicatorDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#f5474c', // Coral indicator
    position: 'absolute',
    bottom: 6,
  },
  taskIndicatorDotSelected: {
    backgroundColor: '#f5474c',
  },
  agendaSection: {
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
    marginBottom: 16,
  },
  emptyAgendaCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    padding: 24,
    alignItems: 'center',
  },
  emptyAgendaText: {
    fontSize: 14,
    color: '#718096',
    fontFamily: 'Roboto_400Regular',
    textAlign: 'center',
  },
  projectCard: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#1b1464',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 10,
      },
      web: {
        boxShadow: '0px 4px 10px rgba(27, 20, 100, 0.04)',
      },
    }),
  },
  projectCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  siteIndicatorBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  siteTypeLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1b1464',
    letterSpacing: 0.5,
    fontFamily: 'Poppins_700Bold',
  },
  statusBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  statusBadge_pending: {
    backgroundColor: '#EDF2F7',
  },
  statusBadge_active: {
    backgroundColor: '#FEFCBF',
  },
  statusBadge_completed: {
    backgroundColor: '#FFEAEA',
  },
  statusBadgeText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#4A5568',
    fontFamily: 'Poppins_700Bold',
  },
  projectName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
    marginBottom: 4,
  },
  projectAddress: {
    fontSize: 13,
    color: '#4A5568',
    fontFamily: 'Roboto_400Regular',
    lineHeight: 18,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#EDF2F7',
    marginVertical: 12,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mediaTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 71, 76, 0.08)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  mediaTagText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#f5474c',
    fontFamily: 'Poppins_600SemiBold',
  },
  mediaTagMuted: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  mediaTagMutedText: {
    fontSize: 11,
    color: '#718096',
    fontFamily: 'Poppins_400Regular',
  },
  navigateBtn: {
    backgroundColor: '#f5474c', // Coral Red guide button
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: 'center',
  },
  navigateBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
    fontFamily: 'Poppins_600SemiBold',
  },
});
