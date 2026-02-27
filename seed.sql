CREATE TABLE calls (
  id SERIAL PRIMARY KEY,
  call_sid VARCHAR(255) UNIQUE NOT NULL,
  from_number VARCHAR(50),
  to_number VARCHAR(50),
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ai_tools (
  name VARCHAR(255) PRIMARY KEY,
  definition JSONB NOT NULL,       -- The Gemini Tool Declaration
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE conversation_graph (
  id SERIAL PRIMARY KEY,
  from_state VARCHAR(100) NOT NULL,
  to_state VARCHAR(100) NOT NULL,
  trigger_tool VARCHAR(255) NOT NULL,
  instruction_update TEXT,         -- The new system prompt for this state
  UNIQUE(from_state, trigger_tool) -- Prevents logic conflicts
);

CREATE TABLE call_sessions (
  stream_sid VARCHAR(255) PRIMARY KEY,
  current_state VARCHAR(100) DEFAULT 'GREETING',
  customer_id VARCHAR(100),
  metadata JSONB DEFAULT '{}',     -- Store temp data like account numbers
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Links to your 'calls' table
  CONSTRAINT fk_call FOREIGN KEY(stream_sid) REFERENCES calls(call_sid)
);

-- 🩺 Store Doctor details and their specialties
CREATE TABLE doctors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  specialty VARCHAR(100) NOT NULL,
  bio TEXT,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 📅 Store the actual bookings
CREATE TABLE appointments (
  id SERIAL PRIMARY KEY,
  call_sid VARCHAR(255), -- Links to your calls table
  doctor_id INTEGER REFERENCES doctors(id),
  patient_last_name VARCHAR(255),
  appointment_time TIMESTAMP NOT NULL,
  status VARCHAR(50) DEFAULT 'SCHEDULED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

------------------- Seed some sample Data -------------------

INSERT INTO doctors (name, specialty) VALUES
('Dr. Smith', 'Cardiology'),
('Dr. Garcia', 'Pediatrics'),
('Dr. Lee', 'Dermatology'),
('Dr. Alice', 'General Practice');

INSERT INTO conversation_graph (from_state, to_state, trigger_tool, instruction_update) VALUES
-- Step 1: Verification
('START', 'VERIFIED', 'verify_patient', 'Identity confirmed. Now, please call the get_specialties_and_doctors tool to see our current availability before asking the patient about their symptoms.'),
-- Step 2: Feed Data -> Triage Mode
('VERIFIED', 'TRIAGE_MODE', 'get_specialties_and_doctors', 'You now have the list of available specialties. Ask the patient to describe their symptoms. Match their symptoms to the list you just received. If no match exists, suggest General Practice.'),
-- Step 3: Triage -> Find Doctor
('TRIAGE_MODE', 'DOCTOR_FOUND', 'match_and_find_doctor', 'You have matched the patient to a specialty. Inform them of the doctor and provide available time slots.'),
-- Step 4: Finalize
('DOCTOR_FOUND', 'CONFIRMED', 'book_appointment', 'Appointment confirmed! Recite the details and end the call politely.');

TRUNCATE ai_tools CASCADE;
INSERT INTO ai_tools (name, definition, is_active)
VALUES
('verify_patient', '{"name": "verify_patient", "description": "Verify patient identity.", "parameters": {"type": "object", "properties": {"dob": {"type": "string"}, "lastName": {"type": "string"}}, "required": ["dob", "lastName"]}}', TRUE),
('get_specialties_and_doctors', '{ "name": "get_specialties_and_doctors", "description": "Fetch the current list of medical specialties and doctors available at the clinic.", "parameters": { "type": "object", "properties": {}, "required": [] }}', TRUE),
('match_and_find_doctor', '{"name": "match_and_find_doctor", "description": "Search for a doctor based on the specialty identified from symptoms.", "parameters": {"type": "object", "properties": {"identified_specialty": {"type": "string"}}, "required": ["identified_specialty"]}}', TRUE),
('book_appointment', '{"name": "book_appointment","description": "Finalize the appointment booking.","parameters": {"type": "object","properties": {"doctor_id": { "type": "integer" },"patient_last_name": { "type": "string" },"appointment_time": { "type": "string", "description": "Format: YYYY-MM-DD HH:MM:SS" }},"required": ["doctor_id", "patient_last_name", "appointment_time"]}}', TRUE);

