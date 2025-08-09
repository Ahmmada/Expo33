// components/DataTable.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SearchBar from './SearchBar';

// تعريف نوع العمود
export type Column<T> = {
  key: keyof T;
  label: string;
  sortable?: boolean;
  render?: (item: T, index: number) => React.ReactNode;
  searchable?: boolean;
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
};

// تعريف نوع خصائص DataTable
type DataTableProps<T> = {
  data: T[];
  columns: Column<T>[];
  actions?: {
    label: string;
    iconName: keyof typeof Ionicons.glyphMap;
    onPress: (item: T) => void;
    style?: any;
    textStyle?: any;
  }[];
  onRowPress?: (item: T) => void;
  emptyStateComponent?: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  initialSortColumn?: keyof T;
  initialSortOrder?: 'asc' | 'desc';
};

// مكون آمن لعرض النصوص فقط إذا كانت قيمة نصية
const SafeText = ({ children }: { children: React.ReactNode }) => {
  if (typeof children === 'string' || typeof children === 'number') {
    return <Text style={styles.dataText}>{String(children)}</Text>;
  }
  return <>{children}</>;
};

function DataTable<T extends { id?: number | string } | { uuid?: string }>({
  data,
  columns,
  actions,
  onRowPress,
  emptyStateComponent,
  refreshing = false,
  onRefresh,
  initialSortColumn = null,
  initialSortOrder = 'asc',
}: DataTableProps<T>) {
  const [sortedData, setSortedData] = useState<T[]>(data);
  const [sortColumn, setSortColumn] = useState<keyof T | null>(initialSortColumn);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(initialSortOrder);
  const [searchQuery, setSearchQuery] = useState('');

  const applySortingAndFiltering = useCallback(() => {
    let currentData = [...data];

    if (searchQuery.trim() !== '') {
      const lowerCaseQuery = searchQuery.toLowerCase();
      currentData = currentData.filter(item =>
        columns.some(col => {
          if (col.searchable) {
            const value = item[col.key];
            return String(value || '').toLowerCase().includes(lowerCaseQuery);
          }
          return false;
        })
      );
    }

    if (sortColumn) {
      currentData.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        if (aValue === null || aValue === undefined) return sortOrder === 'asc' ? 1 : -1;
        if (bValue === null || bValue === undefined) return sortOrder === 'asc' ? -1 : 1;

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortOrder === 'asc'
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        }
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
        }
        return 0;
      });
    }
    setSortedData(currentData);
  }, [data, columns, searchQuery, sortColumn, sortOrder]);

  useEffect(() => {
    applySortingAndFiltering();
  }, [data, searchQuery, sortColumn, sortOrder, applySortingAndFiltering]);

  const handleSortPress = (columnKey: keyof T, sortable: boolean | undefined) => {
    if (!sortable) return;

    if (sortColumn === columnKey) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnKey);
      setSortOrder('asc');
    }
  };

  const calculateTotalContentWidth = useCallback(() => {
    let totalWidth = 0;
    const defaultColumnMinWidth = 120;
    const actionColumnBaseWidth = 80;
    const actionButtonWidth = 80;

    columns.forEach(col => {
      totalWidth += col.minWidth || defaultColumnMinWidth;
    });

    if (actions && actions.length > 0) {
      totalWidth += Math.max(actionColumnBaseWidth, actions.length * actionButtonWidth);
    }
    return totalWidth;
  }, [columns, actions]);

  const totalTableWidth = calculateTotalContentWidth();

  const renderTableHeader = () => (
    <View style={[styles.tableHeader, { width: totalTableWidth }]}>
      {columns.map(col => (
        <TouchableOpacity
          key={String(col.key)}
          onPress={() => handleSortPress(col.key, col.sortable)}
          style={[
            styles.headerCell,
            { minWidth: col.minWidth || 120 },
            col.align && {
              alignItems:
                col.align === 'right'
                  ? 'flex-end'
                  : col.align === 'center'
                  ? 'center'
                  : 'flex-start',
            },
          ]}
        >
          <View style={styles.headerContent}>
            <Text style={styles.headerText}>{col.label}</Text>
            {col.sortable && sortColumn === col.key && (
              <Ionicons
                name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}
                size={14}
                color="#6366f1"
                style={styles.sortIcon}
              />
            )}
          </View>
        </TouchableOpacity>
      ))}
      {actions && actions.length > 0 && (
        <View
          style={[
            styles.headerCell,
            { minWidth: Math.max(80, actions.length * 80) },
          ]}
        >
          <Text style={styles.headerText}>الإجراءات</Text>
        </View>
      )}
    </View>
  );

  const renderTableRow = ({ item, index }: { item: T; index: number }) => (
    <TouchableOpacity
      style={[styles.tableRow, { width: totalTableWidth }]}
      onPress={() => onRowPress && onRowPress(item)}
      activeOpacity={onRowPress ? 0.7 : 1}
    >
      {columns.map(col => (
        <View
          key={String(col.key)}
          style={[
            styles.dataCell,
            { minWidth: col.minWidth || 120 },
            col.align && {
              alignItems:
                col.align === 'right'
                  ? 'flex-end'
                  : col.align === 'center'
                  ? 'center'
                  : 'flex-start',
            },
          ]}
        >
          {col.render ? (
            col.render(item, index)
          ) : (
            <SafeText>{item[col.key]}</SafeText>
          )}
        </View>
      ))}
      {actions && actions.length > 0 && (
        <View
          style={[
            styles.actionsCell,
            { minWidth: Math.max(80, actions.length * 80) },
          ]}
        >
          {actions.map((action, actionIndex) => (
            <TouchableOpacity
              key={actionIndex}
              style={[styles.actionButton, action.style]}
              onPress={() => action.onPress(item)}
            >
              <Ionicons
                name={action.iconName}
                size={18}
                color={action.textStyle?.color || '#3b82f6'}
              />
              <Text style={[styles.actionText, action.textStyle]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <SearchBar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        placeholder="ابحث في الجدول..."
      />
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ width: totalTableWidth }}>
          {renderTableHeader()}
          <FlatList
            data={sortedData}
            keyExtractor={(item, index) => String(item.id || item.uuid || index)}
            renderItem={renderTableRow}
            ListEmptyComponent={
              emptyStateComponent || (
                <View style={styles.emptyState}>
                  <Ionicons name="folder-open-outline" size={64} color="#d1d5db" />
                  <SafeText>لا توجد بيانات للعرض</SafeText>
                </View>
              )
            }
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={styles.flatListContent}
            ItemSeparatorComponent={() => <View style={styles.rowSeparator} />}
            scrollEnabled
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    margin: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerCell: {
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    fontWeight: 'bold',
    color: '#334155',
    fontSize: 13,
  },
  sortIcon: {
    marginLeft: 4,
  },
  tableRow: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
    alignItems: 'center',
  },
  dataCell: {
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  dataText: {
    fontSize: 13,
    color: '#475569',
  },
  actionsCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#eff6ff',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3b82f6',
  },
  rowSeparator: {
    height: 1,
    backgroundColor: '#f1f5f9',
  },
  flatListContent: {
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
});

export default DataTable;