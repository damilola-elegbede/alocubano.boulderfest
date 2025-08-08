#!/usr/bin/env node
import bcrypt from 'bcryptjs';

/**
 * Generate bcrypt hash for check-in staff password
 * Password: $ALC4Bitb!
 */
async function generateStaffPasswordHash() {
  const staffPassword = '$ALC4Bitb!';
  const saltRounds = 10;
  
  try {
    const hash = await bcrypt.hash(staffPassword, saltRounds);
    
    console.log('Check-in Staff Password Configuration');
    console.log('=====================================');
    console.log('Password: $ALC4Bitb!');
    console.log('');
    console.log('Add this to your .env file:');
    console.log('CHECKIN_STAFF_PASSWORD=' + hash);
    console.log('');
    console.log('For 72-hour mobile sessions:');
    console.log('MOBILE_CHECKIN_SESSION_DURATION=259200000');
    console.log('');
    console.log('✅ Staff password hash generated successfully');
    
    // Verify it works
    const isValid = await bcrypt.compare(staffPassword, hash);
    if (isValid) {
      console.log('✅ Hash verification successful');
    } else {
      console.error('❌ Hash verification failed');
    }
    
    return hash;
  } catch (error) {
    console.error('Error generating hash:', error);
    process.exit(1);
  }
}

generateStaffPasswordHash();