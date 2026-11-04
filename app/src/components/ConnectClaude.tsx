import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CONNECTOR_URL, copyConnectorUrl } from '../lib/connector';
import { font, useTheme } from '../lib/theme';

/** Me: how to add the Recomp connector to your own Claude app (no API key needed). */
export function ConnectClaude() {
  const { c, s } = useTheme('move');
  const [copied, setCopied] = useState(false);
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Use Recomp from Claude</Text>
      <Text style={s.body2}>Add Recomp as a connector in your own Claude app and Claude can read your log, estimate foods you logged without numbers, propose plan changes and write your weekly review, on your Claude plan. No API key needed.</Text>
      <View style={{ backgroundColor: c.surface2, borderRadius: 12, padding: 12 }}>
        <Text selectable style={[s.body, { fontFamily: font.medium }]}>{CONNECTOR_URL}</Text>
      </View>
      <Pressable style={s.outline} onPress={() => copyConnectorUrl().then(() => setCopied(true))}><Text style={s.outlineText}>{copied ? 'Copied' : 'Copy the connector address'}</Text></Pressable>
      <View style={{ gap: 4 }}>
        {['In Claude, open Settings, then Connectors.', 'Add a custom connector and paste the address. Name it Project Recomp.', 'Sign in with your Project Recomp email when Claude asks, and tap Allow.', 'Then ask Claude things like "Estimate my pending Recomp foods" or "Review my week".'].map((x, i) => (
          <Text key={i} style={s.body}>{i + 1}. {x}</Text>
        ))}
      </View>
      <Text style={s.label}>Claude can't see or change your checklist, medicines, notes or milestones, and plan changes wait here for you to apply.</Text>
    </View>
  );
}
