import { useEffect, useState } from "react";

import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "./src/firebase";

type Room = {
  id: string;
  name: string;
  building: string;
  capacity: number;
  available: boolean;
};

type Booking = {
  id: string;
  roomId: string;
  roomName: string;
  building: string;
  slot: string;
  purpose: string;
  bookedBy: string;
  createdAt?: unknown;
};

type RoomCardProps = {
  room: Room;
  selected: boolean;
  onSelect: (room: Room) => void;
};

const slots = [
  "08:00-09:00",
  "09:00-10:00",
  "14:00-15:00",
  "15:00-16:00",
];

// Convert a time slot into a Firestore-safe document ID segment.
function toSlotKey(slot: string) {
  return slot.replace(/:/g, "-");
}

function RoomCard({ room, selected, onSelect }: RoomCardProps) {
  return (
    <View style={[styles.card, selected ? styles.selectedCard : null]}>
      <View style={styles.cardHeader}>
        <Text style={styles.roomName}>{room.name}</Text>
        <View
          style={[
            styles.badge,
            room.available ? styles.badgeAvailable : styles.badgeUnavailable,
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              room.available ? styles.badgeTextAvailable : styles.badgeTextUnavailable,
            ]}
          >
            {room.available ? "Available" : "Unavailable"}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.roomMeta}> Building: {room.building}</Text>
        <Text style={styles.roomMeta}> Capacity: {room.capacity} seats</Text>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.selectButton,
          selected ? styles.selectedButton : null,
          !room.available ? styles.disabledButton : null,
          pressed && room.available ? { opacity: 0.8 } : null,
        ]}
        disabled={!room.available}
        onPress={() => onSelect(room)}
      >
        <Text
          style={[
            styles.selectButtonText,
            selected ? styles.selectedButtonText : null,
          ]}
        >
          {!room.available
            ? "Not available"
            : selected
            ? "✓ Selected"
            : "Select Room"}
        </Text>
      </Pressable>
    </View>
  );
}

export default function App() {
  // Shared Firestore data.
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  // Local UI state.
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [purpose, setPurpose] = useState("");
  const [bookedBy, setBookedBy] = useState("");
  const [message, setMessage] = useState("");
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [cancelingId, setCancelingId] = useState<string | null>(null);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  // Firestore rooms → React state → UI.
  useEffect(() => {
    const roomsRef = collection(db, "rooms");

    const unsubscribe = onSnapshot(
      roomsRef,
      (snapshot) => {
        const roomItems = snapshot.docs.map((roomDoc) => ({
          id: roomDoc.id,
          ...roomDoc.data(),
        })) as Room[];

        roomItems.sort((a, b) => a.name.localeCompare(b.name));

        setRooms(roomItems);
        setLoadingRooms(false);
        setErrorMessage("");
      },
      (error) => {
        console.error("Listen rooms failed:", error);
        setErrorMessage(
          "Cannot load rooms. Check Firebase config and Firestore rules."
        );
        setLoadingRooms(false);
      }
    );

    return unsubscribe;
  }, []);

  // Firestore bookings → React state → Recent Bookings UI.
  useEffect(() => {
    const bookingsQuery = query(
      collection(db, "bookings"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        const bookingItems = snapshot.docs.map((bookingDoc) => ({
          id: bookingDoc.id,
          ...bookingDoc.data(),
        })) as Booking[];

        setBookings(bookingItems);
      },
      (error) => {
        console.error("Listen bookings failed:", error);
      }
    );

    return unsubscribe;
  }, []);

  // WEEK 8 SAFE BOOKING:
  async function handleBookRoom() {
    setMessage("");

    if (!selectedRoom) {
      setMessage(" Please select a room.");
      return;
    }

    if (!selectedSlot) {
      setMessage(" Please select a time slot.");
      return;
    }

    if (!purpose.trim()) {
      setMessage(" Please enter purpose.");
      return;
    }

    if (!bookedBy.trim()) {
      setMessage(" Please enter your name.");
      return;
    }

    const slotKey = toSlotKey(selectedSlot);
    const bookingId = `${selectedRoom.id}_${slotKey}`;
    const bookingRef = doc(db, "bookings", bookingId);

    try {
      await runTransaction(db, async (transaction) => {
        const bookingSnap = await transaction.get(bookingRef);
        //await delay(9000);
        if (bookingSnap.exists()) {
          throw new Error("SLOT_ALREADY_BOOKED");
        }

        transaction.set(bookingRef, {
          roomId: selectedRoom.id,
          roomName: selectedRoom.name,
          building: selectedRoom.building,
          slot: selectedSlot,
          purpose: purpose.trim(),
          bookedBy: bookedBy.trim(),
          createdAt: serverTimestamp(),
        });
      });

      setMessage(" Booking successful!");
      setPurpose("");
      setBookedBy("");
      setSelectedSlot(null);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "SLOT_ALREADY_BOOKED"
      ) {
        setMessage(" Slot already booked by another user.");
        return;
      }

      console.error("Booking transaction failed:", error);
      setMessage(" Booking failed. Please try again.");
    }
  }

  // CANCEL BOOKING TRANSACTION
  async function handleCancelBooking(bookingId: string) {
    setCancelingId(bookingId);
    setMessage("");

    const bookingRef = doc(db, "bookings", bookingId);

    try {
      await runTransaction(db, async (transaction) => {
        const bookingSnap = await transaction.get(bookingRef);
        //await delay(2000);
        if (!bookingSnap.exists()) {
          throw new Error("BOOKING_NOT_FOUND");
        }

        transaction.delete(bookingRef);
      });

      setMessage("️ Booking cancelled successfully.");
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "BOOKING_NOT_FOUND"
      ) {
        setMessage(" Booking no longer exists.");
      } else {
        console.error("Cancel booking failed:", error);
        setMessage(" Failed to cancel booking. Try again.");
      }
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={rooms}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <View style={styles.headerContainer}>
              <Text style={styles.eyebrow}>WEEK 8 · LAB 08</Text>
              <Text style={styles.title}>Real-Time Room Booking</Text>
              <Text style={styles.subtitle}>
                Firestore transactions prevent two clients from booking the same room and slot.
              </Text>
            </View>

            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}> Week 8 safe booking</Text>
              <Text style={styles.warningText}>
                • Each room and time slot uses one deterministic booking document ID.
              </Text>
              <Text style={styles.warningText}>
                • The transaction checks whether the slot is already booked before writing.
              </Text>
            </View>

            <Text style={styles.sectionTitle}>Available Rooms</Text>

            {loadingRooms ? (
              <ActivityIndicator size="small" color="#4F46E5" style={{ marginVertical: 12 }} />
            ) : null}

            {errorMessage ? (
              <Text style={styles.error}>{errorMessage}</Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <RoomCard
            room={item}
            selected={selectedRoom?.id === item.id}
            onSelect={(room) => {
              setSelectedRoom(room);
              setSelectedSlot(null);
              setMessage("");
            }}
          />
        )}
        ListEmptyComponent={
          !loadingRooms && !errorMessage ? (
            <Text style={styles.hint}>No rooms found in Firestore.</Text>
          ) : null
        }
        ListFooterComponent={
          <View>
            <View style={styles.bookingPanel}>
              <Text style={styles.panelTitle}> Reserve a Slot</Text>
              <Text style={styles.selectedText}>
                Selected room:{" "}
                <Text style={styles.selectedRoomHighlight}>
                  {selectedRoom ? selectedRoom.name : "None selected"}
                </Text>
              </Text>

              <Text style={styles.label}>Time Slot</Text>

              <View style={styles.slotRow}>
                {slots.map((slot) => {
                  const isSelected = selectedSlot === slot;
                  const isBooked = bookings.some(
                    (booking) =>
                      booking.roomId === selectedRoom?.id &&
                      booking.slot === slot
                  );

                  return (
                    <Pressable
                      key={slot}
                      disabled={isBooked || !selectedRoom}
                      style={[
                        styles.slotButton,
                        isSelected ? styles.selectedSlotButton : null,
                        isBooked || !selectedRoom ? styles.disabledSlotButton : null,
                      ]}
                      onPress={() => {
                        setSelectedSlot(slot);
                        setMessage("");
                      }}
                    >
                      <Text
                        style={[
                          styles.slotText,
                          isSelected ? styles.selectedSlotText : null,
                          isBooked ? styles.bookedSlotText : null,
                        ]}
                      >
                        {isBooked ? `${slot} (Booked)` : slot}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Purpose</Text>
              <TextInput
                style={styles.input}
                value={purpose}
                onChangeText={(text) => {
                  setPurpose(text);
                  setMessage("");
                }}
                placeholder="e.g. Group study session"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.label}>Booked By</Text>
              <TextInput
                style={styles.input}
                value={bookedBy}
                onChangeText={(text) => {
                  setBookedBy(text);
                  setMessage("");
                }}
                placeholder="e.g. John Doe"
                placeholderTextColor="#9CA3AF"
                returnKeyType="done"
              />

              <Pressable
                style={({ pressed }) => [
                  styles.bookButton,
                  pressed ? { opacity: 0.85 } : null,
                ]}
                onPress={handleBookRoom}
              >
                <Text style={styles.bookButtonText}>Confirm Booking</Text>
              </Pressable>

              {message ? <Text style={styles.message}>{message}</Text> : null}
            </View>

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent Bookings</Text>
              <View style={styles.counterBadge}>
                <Text style={styles.counterBadgeText}>{bookings.length}</Text>
              </View>
            </View>

            {bookings.length === 0 ? (
              <Text style={styles.hint}>No active bookings found.</Text>
            ) : (
              bookings.slice(0, 8).map((booking) => (
                <View key={booking.id} style={styles.bookingCard}>
                  <View style={styles.bookingCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bookingRoomName}>{booking.roomName}</Text>
                      <Text style={styles.bookingMetaText}> {booking.building}</Text>
                    </View>
                    <View style={styles.slotBadge}>
                      <Text style={styles.slotBadgeText}>{booking.slot}</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.bookingCardBody}>
                    <Text style={styles.bookingMetaText}>
                       <Text style={styles.boldText}>Purpose:</Text> {booking.purpose}
                    </Text>
                    <Text style={styles.bookingMetaText}>
                       <Text style={styles.boldText}>Booked by:</Text> {booking.bookedBy}
                    </Text>
                    <Text style={styles.bookingIdText}>ID: {booking.id}</Text>
                  </View>

                  <Pressable
                    disabled={cancelingId === booking.id}
                    style={({ pressed }) => [
                      styles.cancelButton,
                      pressed ? { opacity: 0.8 } : null,
                      cancelingId === booking.id ? styles.disabledCancelButton : null,
                    ]}
                    onPress={() => handleCancelBooking(booking.id)}
                  >
                    {cancelingId === booking.id ? (
                      <ActivityIndicator size="small" color="#EF4444" />
                    ) : (
                      <Text style={styles.cancelButtonText}>Cancel Booking</Text>
                    )}
                  </Pressable>
                </View>
              ))
            )}

            <View style={styles.testBox}>
              <Text style={styles.testTitle}> Lab 08 Checkpoints</Text>
              <Text style={styles.testText}>
                Booked slots are disabled using real-time bookings data. Test booking and cancelling the same room and slot across multiple clients to verify real-time sync and atomic transaction execution.
              </Text>
            </View>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  listContent: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  headerContainer: {
    marginBottom: 16,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: "#4F46E5",
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748B",
    lineHeight: 20,
  },
  warningBox: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
    marginBottom: 24,
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#3730A3",
    marginBottom: 6,
  },
  warningText: {
    fontSize: 13,
    color: "#4338CA",
    lineHeight: 18,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 12,
    gap: 8,
  },
  counterBadge: {
    backgroundColor: "#E0E7FF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  counterBadgeText: {
    color: "#4F46E5",
    fontWeight: "700",
    fontSize: 13,
  },
  hint: {
    fontSize: 14,
    color: "#94A3B8",
    fontStyle: "italic",
    marginBottom: 12,
  },
  error: {
    fontSize: 14,
    fontWeight: "600",
    color: "#EF4444",
    marginBottom: 12,
  },
  card: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  selectedCard: {
    borderWidth: 2,
    borderColor: "#4F46E5",
    backgroundColor: "#FAF5FF",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  roomName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeAvailable: {
    backgroundColor: "#DCFCE7",
  },
  badgeUnavailable: {
    backgroundColor: "#FEE2E2",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  badgeTextAvailable: {
    color: "#166534",
  },
  badgeTextUnavailable: {
    color: "#991B1B",
  },
  cardBody: {
    gap: 4,
    marginBottom: 14,
  },
  roomMeta: {
    fontSize: 14,
    color: "#475569",
  },
  selectButton: {
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#4F46E5",
    alignItems: "center",
  },
  selectedButton: {
    backgroundColor: "#312E81",
  },
  disabledButton: {
    backgroundColor: "#E2E8F0",
  },
  selectButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  selectedButtonText: {
    color: "#C7D2FE",
  },
  bookingPanel: {
    marginTop: 12,
    padding: 20,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 6,
  },
  selectedText: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 16,
  },
  selectedRoomHighlight: {
    fontWeight: "700",
    color: "#4F46E5",
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 8,
  },
  slotRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  slotButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
  },
  selectedSlotButton: {
    borderColor: "#4F46E5",
    backgroundColor: "#EEF2FF",
    borderWidth: 2,
  },
  disabledSlotButton: {
    backgroundColor: "#F1F5F9",
    borderColor: "#E2E8F0",
  },
  slotText: {
    fontSize: 13,
    color: "#334155",
  },
  selectedSlotText: {
    fontWeight: "700",
    color: "#4F46E5",
  },
  bookedSlotText: {
    color: "#94A3B8",
    textDecorationLine: "line-through",
  },
  input: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0F172A",
    marginBottom: 14,
  },
  bookButton: {
    marginTop: 6,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#4F46E5",
  },
  bookButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
  message: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
    textAlign: "center",
  },
  bookingCard: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  bookingCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  bookingRoomName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 2,
  },
  slotBadge: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  slotBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  divider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 12,
  },
  bookingCardBody: {
    gap: 4,
    marginBottom: 12,
  },
  bookingMetaText: {
    fontSize: 13,
    color: "#475569",
  },
  boldText: {
    fontWeight: "600",
    color: "#1E293B",
  },
  bookingIdText: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 4,
  },
  cancelButton: {
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
    alignItems: "center",
  },
  disabledCancelButton: {
    opacity: 0.6,
  },
  cancelButtonText: {
    color: "#EF4444",
    fontWeight: "700",
    fontSize: 13,
  },
  testBox: {
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  testTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
  },
  testText: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 18,
  },
});