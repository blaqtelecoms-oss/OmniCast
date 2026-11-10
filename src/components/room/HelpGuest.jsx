import HostRoom from './HostRoom';
import JoinGate from './JoinGate';
import useJoinGate from './useJoinGate';

export default function HelpGuest({ session, me }) {
  const name = me?.full_name || me?.email || 'Guest';
  const { status, askAgain } = useJoinGate({ sessionId: session.id, name });

  if (status === 'accepted') return <HostRoom session={session} me={me} />;

  return <JoinGate session={session} status={status} onAskAgain={askAgain} />;
}