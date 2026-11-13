import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { claudeChat, CONNECTOR_URL, copyConnectorUrl, setClaudeChat } from '../lib/connector';
import { font, useTheme } from '../lib/theme';

/** Me: how to add the Recomp connector to your own Claude app (no API key needed). */
export function ConnectClaude() {
  const { c, s } = useTheme('move');
  const [copied, setCopied] = useState(false);
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Use Project Recomp from Claude</Text>
      <Text style={s.body2}>Add Project Recomp as a connector in your own Claude app and Claude can read your log, estimate foods you logged without numbers, propose plan changes and write your weekly review, on your Claude plan. No API key needed.</Text>
      <View style={{ backgroundColor: c.surface2, borderRadius: 12, padding: 12 }}>
        <Text selectable style={[s.body, { fontFamily: font.medium }]}>{CONNECTOR_URL}</Text>
      </View>
      <Pressable style={s.outline} onPress={() => copyConnectorUrl().then(() => setCopied(true))}><Text style={s.outlineText}>{copied ? 'Copied' : 'Copy the connector address'}</Text></Pressable>
      <View style={{ gap: 4 }}>
        {['In Claude, open Settings, then Connectors.', 'Add a custom connector and paste the address. Name it Project Recomp.', 'Sign in with your Project Recomp email when Claude asks, and tap Allow.', 'Then ask Claude things like "Estimate my pending Project Recomp foods" or "Review my week".'].map((x, i) => (
          <Text key={i} style={s.body}>{i + 1}. {x}</Text>
        ))}
      </View>
      <Text style={s.label}>Claude can't see or change your checklist, medicines, notes or milestones, and plan changes wait here for you to apply.</Text>
      <OneChat />
    </View>
  );
}

/** One chat for every request: paste the link of the Claude chat to use, so Estimate and Review
 *  open it instead of starting a new chat each time. */
function OneChat() {
  const { c, s } = useTheme('move');
  const [saved, setSaved] = useState(claudeChat());
  const [v, setV] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: c.lineSoft, paddingTop: 12 }}>
      <Text style={[s.body, { fontFamily: font.semibold }]}>Keep it in one chat</Text>
      <Text style={s.body2}>
        {saved ? 'Estimate and Review open your Recomp chat in Claude. The request is copied too: if it isn’t already typed in, paste it and send.'
          : 'Estimate and Review start a new Claude chat each time. To use one chat instead, open that chat on claude.ai in a browser, copy the address (it starts with claude.ai/chat/), and paste it here.'}
      </Text>
      {saved ? (
        <>
          <View style={{ backgroundColor: c.surface2, borderRadius: 12, padding: 10 }}><Text selectable numberOfLines={1} style={s.label}>{saved}</Text></View>
          <Pressable style={[s.outline, { alignSelf: 'flex-start' }]} onPress={() => { setClaudeChat(''); setSaved(null); }}><Text style={s.outlineText}>Use new chats again</Text></Pressable>
        </>
      ) : (
        <>
          <TextInput style={s.input} value={v} onChangeText={(t) => { setV(t); setErr(null); }} placeholder="https://claude.ai/chat/…" placeholderTextColor={c.muted}
            autoCapitalize="none" autoCorrect={false} accessibilityLabel="Claude chat link" />
          {err && <Text style={s.error}>{err}</Text>}
          <Pressable style={[s.outline, { alignSelf: 'flex-start' }]} onPress={() => { if (setClaudeChat(v)) { setSaved(claudeChat()); setV(''); } else setErr(v.includes('/share/') ? 'That’s a public share link, not the chat itself. Open the chat on claude.ai in a browser and copy the address bar: it starts with https://claude.ai/chat/' : 'That isn’t a Claude chat link. It starts with https://claude.ai/chat/'); }}>
            <Text style={s.outlineText}>Save chat</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
