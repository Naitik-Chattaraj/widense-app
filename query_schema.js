const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { data: proj } = await supabase.from('projects').select('*').limit(1);
  if (proj && proj.length > 0) {
    const id = proj[0].id;
    const originalStatus = proj[0].status;
    console.log("Original status of", id, "is", originalStatus);
    const { error: err1 } = await supabase.from('projects').update({ status: 'arrived' }).eq('id', id);
    if (err1) {
      console.log("Error updating to arrived:", err1.message);
    } else {
      console.log("Success updating to arrived!");
      // restore original status
      await supabase.from('projects').update({ status: originalStatus }).eq('id', id);
    }
  }
}

test();
