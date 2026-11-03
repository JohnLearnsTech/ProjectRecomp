import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { useTheme } from '../../../lib/theme';

// Placeholder until build step 4.
export default function Progress() {
  const { c, s } = useTheme('body');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }} edges={['top']}>
      <ScrollView contentContainerStyle={s.screen}>
        <ScreenHeader title="Progress" strip={false} />
        <View style={s.card}>
          <Text style={s.body2}>Progress arrives in build step 4.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
