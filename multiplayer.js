(() => {
  const game = window.FourCardPuzzle;
  const configuration = window.FOUR_CARD_SUPABASE_CONFIG || {};
  const roomParameter = 'room';
  const hostMarker = 'four-card-host:';
  const playerMarker = 'four-card-player:';
  let client = null;
  let channel = null;
  let roomId = null;
  let role = null;
  let playerId = null;
  let guestId = null;
  let gameEnded = false;
  let pendingAttempt = null;

  function createId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  }

  function idForRoom(storagePrefix, currentRoom) {
    const key = `${storagePrefix}${currentRoom}`;
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = createId();
      sessionStorage.setItem(key, id);
    }
    return id;
  }

  function updateRoomUrl(currentRoom) {
    const url = new URL(window.location.href);
    url.searchParams.set(roomParameter, currentRoom);
    history.replaceState(null, '', url);
  }

  function clearRoomUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete(roomParameter);
    history.replaceState(null, '', url);
  }

  function setRoomStatus(message, canCopy = false) {
    game.setStatus(message, { canCopy });
  }

  function getClient() {
    if (client) return client;
    if (!configuration.url || !configuration.publishableKey || !window.supabase?.createClient) return null;
    client = window.supabase.createClient(configuration.url, configuration.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    return client;
  }

  async function send(event, payload) {
    if (!channel) return;
    const result = await channel.send({ type: 'broadcast', event, payload });
    if (result !== 'ok') throw new Error(`Realtime send failed: ${result}`);
  }

  async function sendJoin() {
    if (role !== 'guest' || !channel || !playerId) return;
    await send('join', { playerId });
  }

  async function sendRoomState() {
    if (role !== 'host' || !channel) return;
    await send('room-state', {
      hostId: playerId,
      guestId,
      puzzle: game.getPuzzle()
    });
  }

  function bindChannel() {
    channel = client.channel(`four-card:${roomId}`, {
      config: { private: false, broadcast: { ack: true, self: false } }
    });

    channel.on('broadcast', { event: 'host-ready' }, () => {
      if (role === 'guest') sendJoin().catch(showConnectionError);
    });

    channel.on('broadcast', { event: 'join' }, ({ payload }) => {
      if (role !== 'host' || !payload?.playerId || payload.playerId === playerId) return;
      if (guestId && guestId !== payload.playerId) {
        send('room-full', { playerId: payload.playerId }).catch(showConnectionError);
        return;
      }
      guestId = payload.playerId;
      setRoomStatus('친구가 참가했습니다. 먼저 암호를 풀어보세요.', true);
      sendRoomState().catch(showConnectionError);
    });

    channel.on('broadcast', { event: 'room-state' }, ({ payload }) => {
      if (role !== 'guest' || !payload?.puzzle || (payload.guestId && payload.guestId !== playerId)) return;
      if (!game.applyRemotePuzzle(payload.puzzle)) {
        setRoomStatus('퍼즐 데이터를 읽지 못했습니다. 링크를 다시 열어주세요.');
        return;
      }
      guestId = playerId;
      gameEnded = false;
      pendingAttempt = null;
      game.setMultiplayerMode(true);
      game.setRemoteSubmitHandler(submitGuestAttempt);
      setRoomStatus('대결 중입니다. 코드를 먼저 맞혀보세요.');
    });

    channel.on('broadcast', { event: 'room-full' }, ({ payload }) => {
      if (role === 'guest' && payload?.playerId === playerId) {
        setRoomStatus('이 대결 방은 이미 두 명이 참가 중입니다.');
        game.showToast('이 방은 두 명만 참가할 수 있어요.', true);
      }
    });

    channel.on('broadcast', { event: 'attempt' }, ({ payload }) => {
      if (role !== 'host' || gameEnded || payload?.playerId !== guestId) return;
      const results = game.evaluateLetters(payload.letters);
      if (!results) return;
      const passed = Object.values(results).every(Boolean);
      game.showResults(results);
      send('attempt-result', {
        playerId: payload.playerId,
        attemptId: payload.attemptId,
        letters: payload.letters,
        results,
        passed
      }).catch(showConnectionError);
      if (passed) {
        gameEnded = true;
        game.setGameOver();
        setRoomStatus('친구가 먼저 암호를 풀었습니다.');
        send('game-over', { winnerId: guestId }).catch(showConnectionError);
      } else {
        setRoomStatus('친구가 답을 확인 중입니다. 먼저 풀어보세요.');
      }
    });

    channel.on('broadcast', { event: 'attempt-result' }, ({ payload }) => {
      if (role !== 'guest' || payload?.playerId !== playerId || payload.attemptId !== pendingAttempt) return;
      pendingAttempt = null;
      game.showResults(payload.results || {});
      if (!payload.passed) game.showToast('아직 정답이 아닙니다. 표시된 단서를 확인해보세요.', true);
    });

    channel.on('broadcast', { event: 'game-over' }, ({ payload }) => {
      if (!payload?.winnerId || gameEnded) return;
      gameEnded = true;
      game.setGameOver();
      const won = payload.winnerId === playerId;
      setRoomStatus(won ? '먼저 암호를 풀었습니다!' : '친구가 먼저 암호를 풀었습니다.');
      game.showToast(won ? '축하합니다. 먼저 암호를 풀었어요!' : '친구가 먼저 암호를 풀었어요.');
    });
  }

  function subscribeToRoom() {
    bindChannel();
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (!settled) reject(new Error('연결 시간이 초과됐습니다.'));
      }, 15000);
      channel.subscribe((status, error) => {
        if (status === 'SUBSCRIBED' && !settled) {
          settled = true;
          window.clearTimeout(timer);
          if (role === 'host') send('host-ready', { hostId: playerId }).catch(showConnectionError);
          if (role === 'guest') sendJoin().catch(showConnectionError);
          resolve();
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          if (!settled) {
            settled = true;
            window.clearTimeout(timer);
            reject(error || new Error('Realtime 채널에 연결하지 못했습니다.'));
          } else {
            setRoomStatus('연결이 끊겼습니다. 초대 링크를 다시 열어주세요.');
          }
        }
      });
    });
  }

  function showSetupRequired() {
    const message = '온라인 대결을 켜려면 Supabase URL과 publishable key 설정이 필요합니다.';
    setRoomStatus(message);
    game.showToast(message, true);
  }

  function showConnectionError(error) {
    console.error(error);
    setRoomStatus('온라인 연결이 끊겼습니다. 다시 시도해주세요.');
    game.showToast('온라인 방에 연결하지 못했습니다. 설정과 네트워크를 확인해주세요.', true);
  }

  async function createRoom() {
    if (role) return;
    if (!getClient()) return showSetupRequired();
    roomId = createId();
    role = 'host';
    playerId = idForRoom(hostMarker, roomId);
    sessionStorage.setItem(`${hostMarker}${roomId}`, playerId);
    guestId = null;
    gameEnded = false;
    updateRoomUrl(roomId);
    game.setOnlineRole(role);
    game.setNextRoundHandler(startNextRound);
    game.setMultiplayerMode(true);
    setRoomStatus('대결 방을 연결하고 있습니다…');
    try {
      await subscribeToRoom();
      setRoomStatus('친구가 참가하기를 기다리는 중입니다. 초대 링크를 보내주세요.', true);
    } catch (error) {
      showConnectionError(error);
    }
  }

  async function joinRoom(inviteRoom) {
    if (role) return;
    if (!getClient()) return showSetupRequired();
    roomId = inviteRoom;
    role = sessionStorage.getItem(`${hostMarker}${roomId}`) ? 'host' : 'guest';
    playerId = role === 'host'
      ? idForRoom(hostMarker, roomId)
      : idForRoom(playerMarker, roomId);
    guestId = null;
    gameEnded = false;
    game.setOnlineRole(role);
    game.setNextRoundHandler(role === 'host' ? startNextRound : null);
    game.setMultiplayerMode(true);
    setRoomStatus(role === 'host' ? '대결 방에 다시 연결 중입니다…' : '친구의 대결 방에 연결 중입니다…', role === 'host');
    try {
      await subscribeToRoom();
    } catch (error) {
      showConnectionError(error);
    }
  }

  async function submitGuestAttempt(code) {
    if (role !== 'guest' || !channel || gameEnded || pendingAttempt) return;
    pendingAttempt = createId();
    setRoomStatus('친구가 정답을 확인하고 있습니다.');
    try {
      await send('attempt', { playerId, attemptId: pendingAttempt, letters: code.split('') });
    } catch (error) {
      pendingAttempt = null;
      showConnectionError(error);
    }
  }

  async function startNextRound() {
    if (role !== 'host' || !channel || !gameEnded || !guestId) return;
    gameEnded = false;
    pendingAttempt = null;
    try {
      const puzzle = game.startNewPuzzle();
      await send('room-state', { hostId: playerId, guestId, puzzle });
      setRoomStatus('새 라운드입니다. 먼저 암호를 풀어보세요.');
    } catch (error) {
      gameEnded = true;
      game.setGameOver();
      showConnectionError(error);
    }
  }

  async function hostSolved(code) {
    if (role !== 'host' || gameEnded) return;
    gameEnded = true;
    game.setGameOver();
    setRoomStatus('먼저 암호를 풀었습니다!');
    try {
      await send('game-over', { winnerId: playerId, code });
    } catch (error) {
      showConnectionError(error);
    }
  }

  async function copyInvite() {
    if (!roomId) return;
    const inviteUrl = new URL(window.location.href);
    inviteUrl.searchParams.set(roomParameter, roomId);
    try {
      await navigator.clipboard.writeText(inviteUrl.href);
      game.showToast('초대 링크를 복사했습니다. 친구에게 보내주세요.');
    } catch {
      game.showToast(`친구에게 이 링크를 보내주세요: ${inviteUrl.href}`);
    }
  }

  async function leaveRoom() {
    if (channel && client) await client.removeChannel(channel);
    if (roomId) sessionStorage.removeItem(`${hostMarker}${roomId}`);
    channel = null;
    roomId = null;
    role = null;
    playerId = null;
    guestId = null;
    gameEnded = false;
    pendingAttempt = null;
    clearRoomUrl();
    game.endMultiplayer();
  }

  window.FourCardMultiplayer = {
    startOrJoin() {
      const inviteRoom = new URL(window.location.href).searchParams.get(roomParameter);
      return inviteRoom ? joinRoom(inviteRoom) : createRoom();
    },
    copyInvite,
    leave: leaveRoom,
    hostSolved
  };

  const inviteRoom = new URL(window.location.href).searchParams.get(roomParameter);
  if (inviteRoom) {
    if (!/^[A-Za-z0-9_-]{20,}$/.test(inviteRoom)) {
      setRoomStatus('초대 링크가 올바르지 않습니다.');
    } else {
      joinRoom(inviteRoom);
    }
  }
})();
