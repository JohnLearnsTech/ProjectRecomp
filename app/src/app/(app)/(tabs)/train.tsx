import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { useTheme } from '../../../lib/theme';

// Placeholder until build step 3.
export default function Train() {
  const { c, s } = useTheme('train');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }} edges={['top']}>
      <ScrollView contentContainerStyle={s.screen}>
        <ScreenHeader title="Train" strip={false} />
        <View style={s.card}>
          <Text style={s.body2}>Train arrives in build step 3.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
