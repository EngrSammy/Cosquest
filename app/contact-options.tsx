import { FONTS } from "@/constants/fonts";

import { useAppDispatch, useAppSelector } from "@/store/hooks";

import {
  fetchUserContact,
  saveLocationPreference,
  saveUserContact,
} from "@/store/thunks/userThunks";

import { updateAuthUser } from "@/store/slices/authSlice";
import { updateUser } from "@/store/slices/userSlice";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { router } from "expo-router";

import CountryPicker, {
  Country,
  CountryCode,
} from "react-native-country-picker-modal";

import { AsYouType, parsePhoneNumber } from "libphonenumber-js";

import { useEffect, useMemo, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import MapView, { MapPressEvent, Marker, Region } from "react-native-maps";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { safeBack } from "@/utils/safeBack";

const PINK = "#C34D9C";

export default function ContactOptions() {
  const insets = useSafeAreaInsets();

  const dispatch = useAppDispatch();

  const authUser = useAppSelector((state) => state.auth.user);

  const user = useAppSelector((state) => state.user.user);

  const token = useAppSelector((state) => state.auth.token);

  const registrationEmail = authUser?.email || (user as any)?.email || "";

  const savedContact = (user as any)?.contact || {};

  const savedLocation = (user as any)?.location || {};

  const [form, setForm] = useState({
    email: savedContact.email || registrationEmail,

    phone: "",

    businessAddress: savedContact.businessAddress || "",
  });

  const [countryCode, setCountryCode] = useState<CountryCode>("NG");

  const [country, setCountry] = useState<Country | undefined>();

  const [callingCode, setCallingCode] = useState("234");

  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  const [gettingLocation, setGettingLocation] = useState(false);

  const [findingAddress, setFindingAddress] = useState(false);

  const initialCoordinates =
    savedLocation?.lat != null && savedLocation?.lng != null
      ? {
          latitude: savedLocation.lat,
          longitude: savedLocation.lng,
        }
      : null;

  const [marker, setMarker] = useState<{
    latitude: number;
    longitude: number;
  } | null>(initialCoordinates);

  const [mapRegion, setMapRegion] = useState<Region | null>(
    initialCoordinates
      ? {
          latitude: initialCoordinates.latitude,
          longitude: initialCoordinates.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }
      : null,
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    dispatch(fetchUserContact({ token }));
  }, [dispatch, token]);

  useEffect(() => {
    const latestContact = (user as any)?.contact || {};

    setForm((previous) => ({
      email: latestContact.email || registrationEmail,

      phone: latestContact.phone || previous.phone || "",

      businessAddress:
        latestContact.businessAddress || previous.businessAddress || "",
    }));
  }, [user, registrationEmail]);

  useEffect(() => {
    const savedPhone = (user as any)?.contact?.phone;

    if (!savedPhone) {
      return;
    }

    try {
      const parsed = parsePhoneNumber(savedPhone);

      if (parsed?.country) {
        setCountryCode(parsed.country as CountryCode);

        setCallingCode(parsed.countryCallingCode);

        setForm((previous) => ({
          ...previous,
          phone: parsed.nationalNumber,
        }));
      }
    } catch {}
  }, [user]);

  const displayedPhone = form.phone;

  const phonePreview = useMemo(() => {
    if (!form.phone) {
      return "";
    }

    try {
      return new AsYouType(countryCode as any).input(form.phone);
    } catch {
      return form.phone;
    }
  }, [form.phone, countryCode]);

  function update(key: keyof typeof form, value: string) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function handleCountrySelect(selectedCountry: Country) {
    setCountryCode(selectedCountry.cca2);

    setCountry(selectedCountry);

    const newCallingCode = selectedCountry.callingCode?.[0] || "";

    setCallingCode(newCallingCode);

    if (form.phone) {
      validatePhone(form.phone, selectedCountry.cca2);
    }
  }

  function validatePhone(
    value: string,
    selectedCountry: CountryCode = countryCode,
  ) {
    const digits = value.replace(/\D/g, "");

    if (!digits) {
      setPhoneError(null);

      return true;
    }

    try {
      const parsed = parsePhoneNumber(digits, selectedCountry as any);

      if (parsed?.country && parsed.country !== selectedCountry) {
        setPhoneError("This number does not match the selected country.");

        return false;
      }

      if (!parsed || !parsed.isValid()) {
        setPhoneError("Enter a valid phone number for the selected country.");

        return false;
      }

      setPhoneError(null);

      return true;
    } catch {
      setPhoneError("Enter a valid phone number for the selected country.");

      return false;
    }
  }

  function handlePhoneChange(text: string) {
    const digits = text.replace(/\D/g, "");

    setForm((previous) => ({
      ...previous,
      phone: digits,
    }));

    if (digits.length >= 5) {
      validatePhone(digits, countryCode);
    } else {
      setPhoneError(null);
    }
  }

  async function updateAddressFromCoordinates(
    latitude: number,
    longitude: number,
  ) {
    try {
      const addresses = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      if (!addresses.length) {
        return;
      }

      const address = addresses[0];

      const parts = [
        address.name,
        address.street,
        address.city,
        address.region,
        address.country,
      ].filter(Boolean);

      const formatted = address.formattedAddress || parts.join(", ");

      if (formatted) {
        update("businessAddress", formatted);
      }
    } catch (error) {}
  }

  async function setMapLocation(latitude: number, longitude: number) {
    const coordinates = {
      latitude,
      longitude,
    };

    setMarker(coordinates);

    setMapRegion({
      ...coordinates,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });

    await updateAddressFromCoordinates(latitude, longitude);
  }

  async function useCurrentLocation() {
    try {
      setGettingLocation(true);

      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        Alert.alert(
          "Location permission needed",
          "Please allow CosQuest to access your location.",
        );

        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = location.coords;

      await setMapLocation(latitude, longitude);
    } catch (error) {
      Alert.alert("Location error", "We could not get your current location.");
    } finally {
      setGettingLocation(false);
    }
  }

  async function findTypedAddress() {
    const address = form.businessAddress.trim();

    if (!address) {
      Alert.alert("Address required", "Enter an address first.");

      return;
    }

    try {
      setFindingAddress(true);

      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        Alert.alert(
          "Location permission needed",
          "Please allow location access so we can find the address.",
        );

        return;
      }

      const results = await Location.geocodeAsync(address);

      if (!results.length) {
        Alert.alert(
          "Address not found",
          "We could not find that address. Try adding your city or state.",
        );

        return;
      }

      const { latitude, longitude } = results[0];

      await setMapLocation(latitude, longitude);
    } catch (error) {
      Alert.alert("Map error", "We could not find this address.");
    } finally {
      setFindingAddress(false);
    }
  }

  async function handleMapPress(event: MapPressEvent) {
    const { latitude, longitude } = event.nativeEvent.coordinate;

    await setMapLocation(latitude, longitude);
  }

  async function handleSave() {
    const email = form.email.trim() || registrationEmail.trim();

    if (!email) {
      Alert.alert(
        "Email required",
        "We could not determine your account email. Please go back and try again.",
      );

      return;
    }

    let phoneForBackend = "";

    if (form.phone.trim()) {
      const valid = validatePhone(form.phone, countryCode);

      if (!valid) {
        Alert.alert(
          "Invalid phone number",
          phoneError || "Enter a valid phone number for the selected country.",
        );

        return;
      }

      try {
        const parsed = parsePhoneNumber(form.phone, countryCode as any);

        if (!parsed) {
          Alert.alert("Invalid phone number", "Please check the phone number.");

          return;
        }

        phoneForBackend = parsed.number;
      } catch {
        Alert.alert("Invalid phone number", "Please check the phone number.");

        return;
      }
    }

    const businessAddress = form.businessAddress.trim();

    try {
      setSaving(true);

      const contactResult = await dispatch(
        saveUserContact({ token: token || undefined, data: { email, phone: phoneForBackend, businessAddress } }),
      ).unwrap();

      const savedContact = (contactResult as any)?.contact || {
        email,
        phone: phoneForBackend,
        businessAddress,
      };

      dispatch(
        updateUser({
          contact: savedContact,
        }),
      );

      dispatch(
        updateAuthUser({
          contact: savedContact,
        }),
      );

      if (marker) {
        await dispatch(
          saveLocationPreference({
            email,

            locationEnabled: true,

            radiusMiles: (user as any)?.preferences?.radiusMiles || 50,

            lat: marker.latitude,

            lng: marker.longitude,
          }),
        ).unwrap();

        dispatch(
          updateUser({
            location: {
              lat: marker.latitude,

              lng: marker.longitude,
            },

            preferences: {
              locationEnabled: true,
            },
          }),
        );
      }

      Alert.alert(
        "Contact Updated",
        "Your contact information and location have been saved.",
        [
          {
            text: "OK",
            onPress: () => safeBack(),
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        "Save failed",
        error instanceof Error
          ? error.message
          : "Unable to save your contact information.",
      );
    } finally {
      setSaving(false);
    }
  }

  const formattedPhone = displayedPhone ? phonePreview : "";

  const goBack = () => {
    if (router.canGoBack()) {
      safeBack();
    } else {
      router.replace("/edit-profile");
    }
  };

  return (
    <View style={styles.screen}>
      {/* Same background as the Figma screens */}
      <LinearGradient
        colors={["rgba(255,255,255,0.6)", "rgba(184,232,255,0.6)"]}
        locations={[0.0459, 0.677]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* HEADER */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <Pressable
            onPress={goBack}
            hitSlop={10}
            style={styles.headerSide}
            accessibilityRole="button"
            accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={24} color="#191922" />
          </Pressable>

          <Text style={styles.headerTitle}>Contact options</Text>

          <Pressable
            onPress={handleSave}
            hitSlop={10}
            disabled={saving}
            style={[styles.headerSide, styles.headerRight]}
            accessibilityRole="button"
            accessibilityLabel="Save">
            {saving ? (
              <ActivityIndicator size="small" color={PINK} />
            ) : (
              <Text style={styles.save}>Save</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 60 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Gap 20 between every part, like the Figma screens */}
          <View style={styles.form}>
            {/* EMAIL */}
            <View>
              <Text style={styles.label}>Email</Text>

              <View style={[styles.field, styles.iconField]}>
                <Ionicons name="mail-outline" size={19} color={PINK} />

                <TextInput
                  value={form.email}
                  onChangeText={(text) => update("email", text)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  textContentType="emailAddress"
                  autoComplete="email"
                  placeholder="you@example.com"
                  placeholderTextColor="#9C9CAA"
                  style={styles.input}
                />
              </View>
            </View>

            {/* PHONE: country + number in one milky field */}
            <View>
              <Text style={styles.label}>Phone</Text>

              <View
                style={[
                  styles.field,
                  styles.phoneField,
                  phoneError && styles.fieldError,
                ]}>
                <View style={styles.countryBox}>
                  <CountryPicker
                    countryCode={countryCode}
                    withFilter
                    withFlag
                    withEmoji
                    withCallingCode
                    onSelect={handleCountrySelect}
                    theme={{
                      backgroundColor: "#FFFFFF",
                      onBackgroundTextColor: "#191922",
                      fontSize: 14,
                      fontFamily: FONTS.regular,
                    }}
                  />

                  <Text style={styles.callingCode}>+{callingCode}</Text>

                  <Ionicons name="chevron-down" size={14} color="#777780" />
                </View>

                <Ionicons
                  name="call-outline"
                  size={18}
                  color={PINK}
                  style={styles.phoneIcon}
                />

                <TextInput
                  value={formattedPhone}
                  onChangeText={handlePhoneChange}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  placeholder="Phone number"
                  placeholderTextColor="#9C9CAA"
                  style={styles.input}
                />
              </View>

              {phoneError ? (
                <Text style={styles.phoneErrorText}>{phoneError}</Text>
              ) : (
                <Text style={styles.phoneHint}>
                  {country?.name
                    ? `${country.name} number`
                    : "Select your country and enter your phone number"}
                </Text>
              )}
            </View>

            {/* ADDRESS */}
            <View>
              <Text style={styles.label}>Location / Address</Text>

              <View style={[styles.field, styles.iconField]}>
                <Ionicons name="location-outline" size={19} color={PINK} />

                <TextInput
                  value={form.businessAddress}
                  onChangeText={(text) => update("businessAddress", text)}
                  autoCapitalize="words"
                  placeholder="Enter your address"
                  placeholderTextColor="#9C9CAA"
                  style={styles.input}
                />
              </View>
            </View>

            {/* MAP BUTTONS */}
            <View style={styles.mapActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryAction,
                  pressed && { opacity: 0.75 },
                ]}
                onPress={useCurrentLocation}
                disabled={gettingLocation}>
                {gettingLocation ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="navigate" size={17} color="#FFFFFF" />
                )}

                <Text style={styles.primaryActionText}>
                  {gettingLocation ? "Finding you..." : "Use my location"}
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.field,
                  styles.secondaryAction,
                  pressed && { opacity: 0.75 },
                ]}
                onPress={findTypedAddress}
                disabled={findingAddress}>
                {findingAddress ? (
                  <ActivityIndicator size="small" color={PINK} />
                ) : (
                  <Ionicons name="search-outline" size={17} color={PINK} />
                )}

                <Text style={styles.secondaryActionText}>
                  {findingAddress ? "Finding..." : "Find this address"}
                </Text>
              </Pressable>
            </View>

            {/* MAP */}
            <View>
              <Text style={styles.mapTitle}>Choose your location</Text>

              <Text style={styles.mapSubtitle}>
                Tap anywhere on the map or drag the marker. The address above
                updates automatically.
              </Text>

              <View style={styles.mapContainer}>
                {mapRegion ? (
                  <MapView
                    style={styles.map}
                    region={mapRegion}
                    onRegionChangeComplete={setMapRegion}
                    onPress={handleMapPress}
                    showsUserLocation
                    showsMyLocationButton
                    showsCompass
                    rotateEnabled
                    scrollEnabled
                    zoomEnabled>
                    {marker ? (
                      <Marker
                        coordinate={marker}
                        title="Selected location"
                        description={
                          form.businessAddress || "Your selected location"
                        }
                        draggable
                        onDragEnd={async (event) => {
                          const { latitude, longitude } =
                            event.nativeEvent.coordinate;

                          await setMapLocation(latitude, longitude);
                        }}>
                        <View style={styles.marker}>
                          <Ionicons name="location" size={36} color={PINK} />
                        </View>
                      </Marker>
                    ) : null}
                  </MapView>
                ) : (
                  <View style={styles.emptyMap}>
                    <Ionicons name="map-outline" size={38} color={PINK} />

                    <Text style={styles.emptyMapTitle}>
                      No location selected
                    </Text>

                    <Text style={styles.emptyMapText}>
                      Tap &quot;Use my location&quot; or search an address.
                    </Text>
                  </View>
                )}
              </View>

              {marker ? (
                <View style={[styles.field, styles.coordinatesBox]}>
                  <Ionicons name="location-outline" size={16} color={PINK} />

                  <Text style={styles.coordinatesText}>
                    {marker.latitude.toFixed(6)}
                    {" , "}
                    {marker.longitude.toFixed(6)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// The milky, pressed-in field used on every Figma screen:
// background #0000000D, radius 14, padding 14, shadow 0 4 4 #00000017,
// plus a white rim.
const MILKY_FIELD = {
  minHeight: 51,
  paddingHorizontal: 14,
  paddingVertical: 14,
  borderRadius: 14,
  backgroundColor: "#0000000D",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.75)",

  shadowColor: "#000000",
  shadowOpacity: 0.09,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  flex: {
    flex: 1,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 6,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },

  headerSide: {
    width: 60,
    height: 36,
    justifyContent: "center",
  },

  headerRight: {
    alignItems: "flex-end",
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONTS.semibold,
    fontSize: 18,
    color: "#000000",
  },

  save: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: PINK,
  },

  scroll: {
    paddingTop: 14,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },

  // Padding 20 left / right, gap 20 between every part.
  form: {
    paddingHorizontal: 20,
    gap: 20,
  },

  label: {
    marginBottom: 8,
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: "#7A7A84",
  },

  field: MILKY_FIELD,

  fieldError: {
    borderColor: "#D92D20",
  },

  // Icon + text inside a milky field.
  iconField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 0,
  },

  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 49,
    paddingVertical: 0,
    fontFamily: FONTS.regular,
    fontSize: 14.5,
    color: "#191922",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  phoneField: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 0,
    paddingLeft: 6,
  },

  countryBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 8,
    marginRight: 8,
    borderRightWidth: 1,
    borderRightColor: "rgba(130,130,140,0.22)",
  },

  callingCode: {
    marginLeft: 2,
    marginRight: 3,
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: "#33333B",
  },

  phoneIcon: {
    marginRight: 8,
  },

  phoneErrorText: {
    marginTop: 6,
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: "#D92D20",
  },

  phoneHint: {
    marginTop: 6,
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    color: "#7A7A84",
  },

  mapActions: {
    flexDirection: "row",
    gap: 10,
  },

  primaryAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 12,
    backgroundColor: PINK,

    shadowColor: PINK,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },

  primaryActionText: {
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    color: "#FFFFFF",
  },

  // Milky, with pink text.
  secondaryAction: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 0,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },

  secondaryActionText: {
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    color: PINK,
  },

  mapTitle: {
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: "#191922",
  },

  mapSubtitle: {
    marginTop: 2,
    marginBottom: 10,
    fontFamily: FONTS.regular,
    fontSize: 12,
    lineHeight: 18,
    color: "#7A7A84",
  },

  mapContainer: {
    width: "100%",
    height: 270,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#0000000D",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.75)",
  },

  map: {
    width: "100%",
    height: "100%",
  },

  emptyMap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },

  emptyMapTitle: {
    marginTop: 10,
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: "#33333B",
  },

  emptyMapText: {
    marginTop: 4,
    textAlign: "center",
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: "#7A7A84",
  },

  marker: {
    alignItems: "center",
    justifyContent: "center",
  },

  coordinatesBox: {
    marginTop: 12,
    minHeight: 44,
    paddingVertical: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  coordinatesText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: "#6F6F79",
  },
});
