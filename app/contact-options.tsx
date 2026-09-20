import { AppBackground } from "@/components/AppBackground";
import { Field } from "@/components/Field";

import { useAppDispatch, useAppSelector } from "@/store/hooks";

import {
  fetchUserContact,
  saveLocationPreference,
  saveUserContact,
} from "@/store/thunks/userThunks";

import { updateAuthUser } from "@/store/slices/authSlice";
import { updateUser } from "@/store/slices/userSlice";

import { Ionicons } from "@expo/vector-icons";
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
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import MapView, { MapPressEvent, Marker, Region } from "react-native-maps";

import { useSafeAreaInsets } from "react-native-safe-area-context";

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

    dispatch(fetchUserContact(token));
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
      return new AsYouType(countryCode).input(form.phone);
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
      const parsed = parsePhoneNumber(digits, selectedCountry);

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
        const parsed = parsePhoneNumber(form.phone, countryCode);

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
        saveUserContact({
          token: token || undefined,

          email,

          phone: phoneForBackend,

          businessAddress,
        }),
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
            onPress: () => router.back(),
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

  return (
    <AppBackground variant="blueGradient">
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 8,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color="#191922" />
          </Pressable>

          <Text style={styles.headerTitle}>Contact options</Text>

          <Pressable onPress={handleSave} hitSlop={10} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color="#C5399A" />
            ) : (
              <Text style={styles.save}>Save</Text>
            )}
          </Pressable>
        </View>

        <Field
          label="Email"
          leftIcon="mail-outline"
          value={form.email}
          onChangeText={(text) => update("email", text)}
          keyboardType="email-address"
          autoCapitalize="none"
          textContentType="emailAddress"
          autoComplete="email"
        />

        <Text style={styles.fieldLabel}>Phone</Text>

        <View
          style={[
            styles.phoneContainer,
            phoneError && styles.phoneErrorBorder,
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
              }}
            />

            <Text style={styles.callingCode}>+{callingCode}</Text>

            <Ionicons name="chevron-down" size={15} color="#777780" />
          </View>

          <View style={styles.phoneInputWrap}>
            <Ionicons name="call-outline" size={20} color="#C5399A" />

            <View style={styles.phoneInputContent}>
              <Field
                value={formattedPhone}
                onChangeText={handlePhoneChange}
                keyboardType="phone-pad"
                autoCapitalize="none"
                placeholder="Phone number"
                placeholderTextColor="#9999A2"
              />
            </View>
          </View>
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

        <Field
          label="Location / Address"
          leftIcon="location-outline"
          value={form.businessAddress}
          onChangeText={(text) => update("businessAddress", text)}
          autoCapitalize="words"
          placeholder="Enter your address"
          placeholderTextColor="#9999A2"
        />

        <View style={styles.mapActions}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryAction,
              pressed && {
                opacity: 0.75,
              },
            ]}
            onPress={useCurrentLocation}
            disabled={gettingLocation}>
            {gettingLocation ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="navigate" size={18} color="#FFFFFF" />
            )}

            <Text style={styles.primaryActionText}>
              {gettingLocation ? "Finding you..." : "Use my current location"}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.secondaryAction,
              pressed && {
                opacity: 0.75,
              },
            ]}
            onPress={findTypedAddress}
            disabled={findingAddress}>
            {findingAddress ? (
              <ActivityIndicator size="small" color="#C5399A" />
            ) : (
              <Ionicons name="search-outline" size={18} color="#C5399A" />
            )}

            <Text style={styles.secondaryActionText}>
              {findingAddress ? "Finding..." : "Find this address"}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.mapTitle}>Choose your location</Text>

        <Text style={styles.mapSubtitle}>
          Tap anywhere on the map or drag the marker. The address above will
          update automatically.
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
                  description={form.businessAddress || "Your selected location"}
                  draggable
                  onDragEnd={async (event) => {
                    const { latitude, longitude } =
                      event.nativeEvent.coordinate;

                    await setMapLocation(latitude, longitude);
                  }}>
                  <View style={styles.marker}>
                    <Ionicons name="location" size={36} color="#C5399A" />
                  </View>
                </Marker>
              ) : null}
            </MapView>
          ) : (
            <View style={styles.emptyMap}>
              <Ionicons name="map-outline" size={40} color="#C5399A" />

              <Text style={styles.emptyMapTitle}>No location selected</Text>

              <Text style={styles.emptyMapText}>
                Tap "Use my current location" or search an address.
              </Text>
            </View>
          )}
        </View>

        {marker ? (
          <View style={styles.coordinatesBox}>
            <Ionicons name="location-outline" size={17} color="#C5399A" />

            <Text style={styles.coordinatesText}>
              {marker.latitude.toFixed(6)}
              {" , "}
              {marker.longitude.toFixed(6)}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 60,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#191922",
  },

  save: {
    fontSize: 16,
    fontWeight: "700",
    color: "#C5399A",
  },

  fieldLabel: {
    fontSize: 13,
    color: "#37373A",
    marginBottom: 8,
    marginTop: 4,
  },

  phoneContainer: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 58,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderWidth: 0.6,
    borderColor: "rgba(255,255,255,0.35)",
  },

  phoneErrorBorder: {
    borderColor: "#D92D20",
  },

  countryBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 10,
    paddingRight: 8,
    borderRightWidth: 0.5,
    borderRightColor: "rgba(130,130,140,0.25)",
  },

  callingCode: {
    marginLeft: 2,
    fontSize: 14,
    fontWeight: "600",
    color: "#33333B",
  },

  phoneInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 10,
  },

  phoneInputContent: {
    flex: 1,
    marginLeft: 2,
  },

  phoneErrorText: {
    marginTop: 6,
    fontSize: 12,
    color: "#D92D20",
  },

  phoneHint: {
    marginTop: 6,
    fontSize: 12,
    color: "#777780",
  },

  mapActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
    marginBottom: 18,
  },

  primaryAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingHorizontal: 12,
    backgroundColor: "#C5399A",
  },

  primaryActionText: {
    marginLeft: 7,
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },

  secondaryAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderWidth: 0.5,
    borderColor: "#C5399A",
  },

  secondaryActionText: {
    marginLeft: 7,
    color: "#C5399A",
    fontSize: 12,
    fontWeight: "700",
  },

  mapTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#191922",
    marginBottom: 4,
  },

  mapSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: "#777780",
    marginBottom: 10,
  },

  mapContainer: {
    width: "100%",
    height: 270,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.25)",
    marginBottom: 12,
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
    fontSize: 15,
    fontWeight: "700",
    color: "#33333B",
  },

  emptyMapText: {
    marginTop: 5,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
    color: "#777780",
  },

  marker: {
    alignItems: "center",
    justifyContent: "center",
  },

  coordinatesBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginBottom: 8,
  },

  coordinatesText: {
    marginLeft: 7,
    fontSize: 12,
    color: "#6F6F79",
  },
});
